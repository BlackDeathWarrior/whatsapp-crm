import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { validateAiCredentials } from '@/lib/ai/validate'
import { resolveCredentials } from '@/lib/ai/credentials'
import { loadProviderKey } from '@/lib/ai/provider-keys'
import { isAiProvider } from '@/lib/ai/providers/catalog'
import { AiError } from '@/lib/ai/types'

/**
 * POST /api/ai/test  (admin+)
 *
 * "Test key" button: validate a candidate provider/model/key against
 * the provider WITHOUT saving. When `api_key` is omitted the stored
 * key is used (same provider + endpoint only), so an admin can re-test
 * an existing config (e.g. after changing the model). Returns `{ ok: true }` on success, 400 with the
 * provider's message on failure.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-test:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('ai_configs')
      .select('provider, api_key, base_url')
      .eq('account_id', accountId)
      .maybeSingle()

    const saved = isAiProvider(body.provider)
      ? await loadProviderKey(supabase, accountId, body.provider)
      : null

    const creds = await resolveCredentials(body, existing, saved)
    if (!creds.ok) {
      return NextResponse.json({ error: creds.error }, { status: 400 })
    }

    try {
      await validateAiCredentials({
        provider: creds.provider,
        model: creds.model,
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
        systemPrompt: null,
        isActive: true,
        autoReplyEnabled: false,
        autoReplyMaxPerConversation: 3,
        handoffAgentId: null,
        embeddingsApiKey: null,
      })
    } catch (err) {
      if (err instanceof AiError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: 400 },
        )
      }
      console.error('[ai/test] validation error:', err)
      return NextResponse.json(
        { error: 'Could not validate the API key.' },
        { status: 400 },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
