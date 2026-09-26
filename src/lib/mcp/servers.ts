import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from '@/lib/whatsapp/encryption'
import { aiRequestTimeoutMs } from '@/lib/ai/defaults'
import type { AgentTool, AgentToolset } from '@/lib/ai/types'
import { McpHttpClient } from './client'

// ============================================================
// Custom MCP servers (Settings → MCP) and the toolset the AI agent
// builds from them.
//
// Each account can register remote MCP servers. Auth headers are stored
// AES-256-GCM-encrypted as one JSON blob and never returned to the
// browser — the API exposes only the header *names*.
// ============================================================

export const MAX_MCP_SERVERS = 20
/** Cap on tools offered to the model across all servers — large tool
 *  lists cost prompt tokens on every call and degrade tool choice. */
export const MAX_AGENT_TOOLS = 64
/** Connect + list budget per server when building a toolset. Kept short:
 *  a slow server must not eat the customer-facing reply's time. */
const CONNECT_TIMEOUT_MS = 8_000

export interface McpServerRecord {
  id: string
  name: string
  url: string
  enabled: boolean
  headers: Record<string, string>
}

interface McpServerRow {
  id: string
  name: string
  url: string
  enabled: boolean
  headers: string | null
}

export function encryptHeaders(headers: Record<string, string>): string | null {
  return Object.keys(headers).length > 0 ? encrypt(JSON.stringify(headers)) : null
}

export function decryptHeaders(stored: string | null): Record<string, string> {
  if (!stored) return {}
  const parsed = JSON.parse(decrypt(stored)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  )
}

// RFC 7230 token chars for a header name.
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,100}$/
// Headers the client sets itself; letting an admin override them would
// break the protocol handshake.
const RESERVED_HEADERS = new Set([
  'content-type',
  'accept',
  'content-length',
  'host',
  'mcp-session-id',
  'mcp-protocol-version',
])

/**
 * Validate a headers object from a request body. Returns the cleaned map
 * or an error string.
 */
export function parseHeadersInput(
  raw: unknown,
): { headers: Record<string, string> } | { error: string } {
  if (raw === null || raw === undefined) return { headers: {} }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'headers must be an object of name → value' }
  }
  const out: Record<string, string> = {}
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > 10) return { error: 'At most 10 headers per server.' }
  for (const [name, value] of entries) {
    const key = name.trim()
    if (!key) continue
    if (!HEADER_NAME.test(key)) return { error: `Invalid header name: ${key}` }
    if (RESERVED_HEADERS.has(key.toLowerCase())) {
      return { error: `The ${key} header is set automatically.` }
    }
    if (typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 4000) {
      return { error: `Invalid value for header ${key}` }
    }
    out[key] = value
  }
  return { headers: out }
}

/** Load the account's servers with decrypted headers. A server whose
 *  headers can't be decrypted is skipped (and logged), not fatal. */
export async function loadMcpServers(
  db: SupabaseClient,
  accountId: string,
  opts: { enabledOnly?: boolean } = {},
): Promise<McpServerRecord[]> {
  let query = db
    .from('mcp_servers')
    .select('id, name, url, enabled, headers')
    .eq('account_id', accountId)
  if (opts.enabledOnly) query = query.eq('enabled', true)
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw error

  const out: McpServerRecord[] = []
  for (const row of (data ?? []) as McpServerRow[]) {
    try {
      out.push({ ...row, headers: decryptHeaders(row.headers) })
    } catch {
      console.error(
        `[mcp] headers for server ${row.id} could not be decrypted — check ENCRYPTION_KEY; skipping it.`,
      )
    }
  }
  return out
}

/** Provider-safe tool name: `<server>__<tool>`, [A-Za-z0-9_-], ≤ 64. */
export function agentToolName(serverName: string, toolName: string): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '')
  const prefix = clean(serverName).slice(0, 20) || 'mcp'
  return `${prefix}__${clean(toolName)}`.slice(0, 64)
}

export interface LoadedToolset {
  toolset: AgentToolset
  close(): Promise<void>
}

/**
 * Connect to every enabled MCP server for the account and expose their
 * tools as one toolset. Best-effort throughout: a server that is down,
 * slow, or misconfigured is logged and skipped, and any failure here
 * yields `null` (plain generation) rather than failing the reply.
 */
export async function loadAgentToolset(
  db: SupabaseClient,
  accountId: string,
): Promise<LoadedToolset | null> {
  let servers: McpServerRecord[]
  try {
    servers = await loadMcpServers(db, accountId, { enabledOnly: true })
  } catch (err) {
    // Includes "table doesn't exist" on a deployment that hasn't run the
    // migration yet — the agent must keep working without MCP.
    console.error('[mcp] could not load servers:', err)
    return null
  }
  if (servers.length === 0) return null

  const connected = await Promise.all(
    servers.map(async (server) => {
      const client = new McpHttpClient(server.url, server.headers, CONNECT_TIMEOUT_MS)
      try {
        await client.connect()
        const tools = await client.listTools()
        // Tool calls may legitimately take longer than discovery.
        client.timeoutMs = aiRequestTimeoutMs()
        return { server, client, tools }
      } catch (err) {
        console.error(
          `[mcp] server "${server.name}" unavailable, skipping:`,
          err instanceof Error ? err.message : err,
        )
        void client.close()
        return null
      }
    }),
  )

  const tools: AgentTool[] = []
  const routes = new Map<string, { client: McpHttpClient; toolName: string }>()
  const clients: McpHttpClient[] = []

  for (const entry of connected) {
    if (!entry) continue
    clients.push(entry.client)
    for (const tool of entry.tools) {
      if (tools.length >= MAX_AGENT_TOOLS) break
      const base = agentToolName(entry.server.name, tool.name)
      let name = base
      for (let n = 2; routes.has(name); n++) name = `${base.slice(0, 60)}_${n}`
      routes.set(name, { client: entry.client, toolName: tool.name })
      tools.push({
        name,
        description: `[${entry.server.name}] ${tool.description}`.slice(0, 1024),
        inputSchema:
          tool.inputSchema.type === 'object' ? tool.inputSchema : { type: 'object', properties: {} },
      })
    }
  }

  const closeAll = async () => {
    await Promise.all(clients.map((c) => c.close()))
  }
  if (tools.length === 0) {
    await closeAll()
    return null
  }

  const toolset: AgentToolset = {
    tools,
    async call(name, args) {
      const route = routes.get(name)
      if (!route) return `Tool error: unknown tool "${name}".`
      try {
        return await route.client.callTool(route.toolName, args)
      } catch (err) {
        return `Tool error: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  }

  return { toolset, close: closeAll }
}
