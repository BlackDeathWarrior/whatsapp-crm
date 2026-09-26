import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { checkOutboundAiUrl } from '@/lib/ai/outbound-url'
import {
  MAX_MCP_SERVERS,
  encryptHeaders,
  loadMcpServers,
  parseHeadersInput,
} from '@/lib/mcp/servers'

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * GET /api/mcp/servers
 *
 * Any member may list the account's custom MCP servers. Header VALUES
 * are never returned — only their names, so the form can show which
 * headers are set.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const servers = await loadMcpServers(supabase, accountId)
    return NextResponse.json({
      servers: servers.map(({ headers, ...s }) => ({
        ...s,
        header_names: Object.keys(headers),
      })),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/mcp/servers  (admin+)
 *
 * Register a remote MCP server: `{ name, url, headers?, enabled? }`.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`mcp-servers:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 60) return bad('Name is required (max 60 characters).')

    const url = typeof body.url === 'string' ? body.url.trim() : ''
    if (!url || url.length > 2000) return bad('URL is required.')
    const blocked = await checkOutboundAiUrl(url)
    if (blocked) return bad(blocked)

    const parsed = parseHeadersInput(body.headers)
    if ('error' in parsed) return bad(parsed.error)

    const { count } = await supabase
      .from('mcp_servers')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
    if ((count ?? 0) >= MAX_MCP_SERVERS) {
      return bad(`At most ${MAX_MCP_SERVERS} MCP servers per workspace.`)
    }

    const { data, error } = await supabase
      .from('mcp_servers')
      .insert({
        account_id: accountId,
        created_by: userId,
        name,
        url,
        headers: encryptHeaders(parsed.headers),
        enabled: body.enabled !== false,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') return bad('A server with that name already exists.')
      console.error('[mcp/servers POST] insert error:', error)
      return NextResponse.json({ error: 'Failed to save MCP server' }, { status: 500 })
    }
    return NextResponse.json({ id: data.id }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
