import { checkOutboundAiUrl } from '@/lib/ai/outbound-url'

// ============================================================
// Minimal MCP client over the Streamable HTTP transport.
//
// Just enough of the protocol for the AI agent to use a remote MCP
// server's tools: `initialize` → `notifications/initialized` →
// `tools/list` / `tools/call`, with the `Mcp-Session-Id` handshake and
// either a JSON or a (single-response) SSE reply body.
//
// Hand-rolled rather than @modelcontextprotocol/sdk so every request
// goes through the same SSRF guard, timeout and `redirect: 'manual'`
// discipline as the rest of the app's outbound calls, with no new
// dependency. Only remote HTTP servers are supported — a serverless
// deployment can't spawn stdio servers, and letting account admins run
// commands on the host would be far worse than SSRF.
// ============================================================

const PROTOCOL_VERSION = '2025-06-18'
const MAX_TOOL_PAGES = 5

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export class McpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'McpError'
  }
}

interface JsonRpcResponse {
  jsonrpc?: string
  id?: number | string | null
  result?: unknown
  error?: { code?: number; message?: string }
}

/** Pull the JSON-RPC response with `id` out of an SSE body. */
function parseSse(body: string, id: number): JsonRpcResponse | null {
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n')
    if (!data) continue
    try {
      const msg = JSON.parse(data) as JsonRpcResponse
      if (msg && msg.id === id) return msg
    } catch {
      // Not JSON — skip (comments, keep-alives).
    }
  }
  return null
}

/**
 * Read an SSE body until the response for `id` arrives, then stop. A
 * server may keep the stream open after answering, so waiting for EOF
 * would stall until the timeout.
 */
async function readSseResponse(res: Response, id: number): Promise<JsonRpcResponse | null> {
  const reader = res.body?.getReader()
  if (!reader) return null
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (value) buffer += decoder.decode(value, { stream: true })
      const msg = parseSse(buffer, id)
      if (msg) return msg
      if (done) return null
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new McpError('MCP server timed out.')
    }
    throw new McpError(
      `MCP stream failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    reader.cancel().catch(() => {})
  }
}

/** Flatten an MCP `tools/call` result into text for the model. */
export function toolResultText(result: unknown): string {
  const r = (result ?? {}) as {
    content?: { type?: string; text?: string; resource?: { text?: string; uri?: string } }[]
    structuredContent?: unknown
    isError?: boolean
  }
  const parts = (r.content ?? []).map((c) => {
    if (c.type === 'text' && typeof c.text === 'string') return c.text
    if (c.type === 'resource' && c.resource) return c.resource.text ?? `[resource ${c.resource.uri ?? ''}]`
    return `[${c.type ?? 'unknown'} content]`
  })
  let text = parts.join('\n').trim()
  if (!text && r.structuredContent !== undefined) {
    text = JSON.stringify(r.structuredContent)
  }
  if (!text) text = '(no output)'
  return r.isError ? `Tool error: ${text}` : text
}

export class McpHttpClient {
  private sessionId: string | null = null
  private nextId = 1
  private initialized = false

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string>,
    /** Per-request timeout. Mutable so a caller can connect on a short
     *  budget, then allow tool calls longer. */
    public timeoutMs: number,
  ) {}

  private baseHeaders(): Record<string, string> {
    const h: Record<string, string> = {
      ...this.headers,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    }
    if (this.initialized) h['MCP-Protocol-Version'] = PROTOCOL_VERSION
    if (this.sessionId) h['Mcp-Session-Id'] = this.sessionId
    return h
  }

  private async post(payload: unknown): Promise<Response> {
    try {
      return await fetch(this.url, {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: 'manual',
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new McpError('MCP server timed out.')
      }
      throw new McpError(
        `Could not reach MCP server: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++
    const res = await this.post({ jsonrpc: '2.0', id, method, params })

    if (res.status >= 300 && res.status < 400) {
      throw new McpError(`MCP server redirected (${res.status}); use the final URL.`)
    }
    if (res.status === 401 || res.status === 403) {
      throw new McpError(`MCP server rejected the credentials (${res.status}). Check the auth header.`)
    }
    if (!res.ok) {
      throw new McpError(`MCP server returned HTTP ${res.status} for ${method}.`)
    }

    const sid = res.headers.get('mcp-session-id')
    if (sid) this.sessionId = sid

    const contentType = res.headers.get('content-type') ?? ''
    let msg: JsonRpcResponse | null
    if (contentType.includes('text/event-stream')) {
      msg = await readSseResponse(res, id)
    } else {
      msg = (await res.json().catch(() => null)) as JsonRpcResponse | null
    }
    if (!msg) throw new McpError(`MCP server sent an unreadable response to ${method}.`)
    if (msg.error) {
      throw new McpError(`MCP ${method} failed: ${msg.error.message ?? 'unknown error'}`)
    }
    return msg.result
  }

  private async notify(method: string): Promise<void> {
    const res = await this.post({ jsonrpc: '2.0', method })
    // 202 Accepted is the spec answer; tolerate any 2xx.
    if (!res.ok) {
      throw new McpError(`MCP server returned HTTP ${res.status} for ${method}.`)
    }
    await res.body?.cancel().catch(() => {})
  }

  /** SSRF-check the URL, then run the initialize handshake. */
  async connect(): Promise<{ serverName: string | null }> {
    const blocked = await checkOutboundAiUrl(this.url)
    if (blocked) throw new McpError(blocked)

    const result = (await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'wacrm', version: '1.0.0' },
    })) as { serverInfo?: { name?: string } } | undefined
    this.initialized = true
    await this.notify('notifications/initialized')
    return { serverName: result?.serverInfo?.name ?? null }
  }

  async listTools(): Promise<McpToolInfo[]> {
    const out: McpToolInfo[] = []
    let cursor: string | undefined
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const result = (await this.request('tools/list', cursor ? { cursor } : {})) as
        | {
            tools?: { name?: string; description?: string; inputSchema?: Record<string, unknown> }[]
            nextCursor?: string
          }
        | undefined
      for (const t of result?.tools ?? []) {
        if (!t?.name) continue
        out.push({
          name: t.name,
          description: t.description ?? '',
          inputSchema:
            t.inputSchema && typeof t.inputSchema === 'object'
              ? t.inputSchema
              : { type: 'object', properties: {} },
        })
      }
      cursor = result?.nextCursor
      if (!cursor) break
    }
    return out
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request('tools/call', { name, arguments: args })
    return toolResultText(result)
  }

  /** Best-effort session teardown. */
  async close(): Promise<void> {
    if (!this.sessionId) return
    try {
      await fetch(this.url, {
        method: 'DELETE',
        headers: this.baseHeaders(),
        signal: AbortSignal.timeout(5_000),
        redirect: 'manual',
      })
    } catch {
      // Server may not support DELETE; the session will expire.
    }
  }
}
