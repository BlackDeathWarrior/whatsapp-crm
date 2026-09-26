import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { McpError, McpHttpClient } from '@/lib/mcp/client'
import { loadMcpServers, parseHeadersInput } from '@/lib/mcp/servers'

const TEST_TIMEOUT_MS = 10_000

/**
 * POST /api/mcp/test  (admin+)
 *
 * Connect to an MCP server and list its tools, without saving.
 * Body: `{ url, headers? }` to test a server being added, or `{ id }`
 * to test a saved one. When editing a saved server, `{ id, url?,
 * headers? }` overrides the stored values — but the stored headers are
 * only sent to the stored URL, never to a changed one (same key-reuse
 * rule as the AI provider key).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`mcp-test:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    let url = typeof body.url === 'string' ? body.url.trim() : ''
    let headers: Record<string, string> = {}

    if (typeof body.id === 'string' && body.id) {
      const saved = (await loadMcpServers(supabase, accountId)).find((s) => s.id === body.id)
      if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      if (!url || url === saved.url) {
        url = saved.url
        headers = saved.headers
      }
    }
    if ('headers' in body) {
      const parsed = parseHeadersInput(body.headers)
      if ('error' in parsed) {
        return NextResponse.json({ error: parsed.error }, { status: 400 })
      }
      headers = parsed.headers
    }
    if (!url) return NextResponse.json({ error: 'URL is required.' }, { status: 400 })

    const client = new McpHttpClient(url, headers, TEST_TIMEOUT_MS)
    try {
      const { serverName } = await client.connect()
      const tools = await client.listTools()
      return NextResponse.json({
        ok: true,
        server_name: serverName,
        tools: tools.map((t) => ({ name: t.name, description: t.description })),
      })
    } catch (err) {
      if (!(err instanceof McpError)) console.error('[mcp/test] error:', err)
      const message =
        err instanceof McpError ? err.message : 'Could not connect to the MCP server.'
      return NextResponse.json({ error: message }, { status: 400 })
    } finally {
      void client.close()
    }
  } catch (err) {
    return toErrorResponse(err)
  }
}
