import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { checkOutboundAiUrl } from '@/lib/ai/outbound-url'
import { encryptHeaders, parseHeadersInput } from '@/lib/mcp/servers'

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * PATCH /api/mcp/servers/[id]  (admin+)
 *
 * Partial update. `headers`: an object replaces the stored set (the
 * form sends it only when edited); absent leaves it unchanged.
 * Scoped by account_id as well as id so a guessed UUID from another
 * account never matches (RLS enforces the same).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`mcp-servers:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const { id } = await params
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const update: Record<string, unknown> = {}

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name || name.length > 60) return bad('Name is required (max 60 characters).')
      update.name = name
    }
    if ('url' in body) {
      const url = typeof body.url === 'string' ? body.url.trim() : ''
      if (!url || url.length > 2000) return bad('URL is required.')
      const blocked = await checkOutboundAiUrl(url)
      if (blocked) return bad(blocked)

      // Stored auth headers were entered for the stored URL. Moving the
      // server elsewhere without re-entering them would hand those
      // secrets to a host nobody vetted them for.
      const { data: current } = await supabase
        .from('mcp_servers')
        .select('url, headers')
        .eq('id', id)
        .eq('account_id', accountId)
        .maybeSingle()
      if (current && current.url !== url && current.headers && !('headers' in body)) {
        return bad('Re-enter the auth headers when changing the server URL.')
      }
      update.url = url
    }
    if ('headers' in body) {
      const parsed = parseHeadersInput(body.headers)
      if ('error' in parsed) return bad(parsed.error)
      update.headers = encryptHeaders(parsed.headers)
    }
    if ('enabled' in body) update.enabled = body.enabled === true

    if (Object.keys(update).length === 0) return bad('Nothing to update.')

    const { data, error } = await supabase
      .from('mcp_servers')
      .update(update)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id')
      .maybeSingle()

    if (error) {
      if (error.code === '23505') return bad('A server with that name already exists.')
      console.error('[mcp/servers PATCH] error:', error)
      return NextResponse.json({ error: 'Failed to update MCP server' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** DELETE /api/mcp/servers/[id]  (admin+) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`mcp-servers:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const { id } = await params
    const { error } = await supabase
      .from('mcp_servers')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId)
    if (error) {
      console.error('[mcp/servers DELETE] error:', error)
      return NextResponse.json({ error: 'Failed to delete MCP server' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
