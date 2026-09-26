import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { encrypt } from '@/lib/whatsapp/encryption'
import { checkOutboundAiUrl } from '@/lib/ai/outbound-url'
import { loadProviderKeys, saveProviderKey } from '@/lib/ai/provider-keys'
import {
  AI_PROVIDERS,
  AI_PROVIDER_META,
  isAiProvider,
  normalizeBaseUrl,
} from '@/lib/ai/providers/catalog'

// ============================================================
// /api/ai/keys — the per-provider key store behind AI Agents → API keys.
// Admin+ only. Keys are write-only: GET returns `has_key` flags, never
// the key itself.
// ============================================================

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/** GET — one row per provider: whether a key is saved, and (for local)
 *  its base URL. */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const saved = await loadProviderKeys(supabase, accountId)
    const byProvider = new Map(saved.map((k) => [k.provider, k]))
    return NextResponse.json({
      keys: AI_PROVIDERS.map((provider) => {
        const k = byProvider.get(provider)
        return {
          provider,
          saved: !!k,
          has_key: !!k?.api_key,
          base_url: k?.base_url ?? null,
          updated_at: k?.updated_at ?? null,
        }
      }),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PUT — save/replace one provider's key: `{ provider, api_key, base_url? }`.
 * If that provider is the one currently active in Setup (same base URL
 * for `local`), the active config picks up the new key immediately.
 */
export async function PUT(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-keys:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const provider = body.provider
    if (!isAiProvider(provider)) {
      return bad(`provider must be one of: ${AI_PROVIDERS.join(', ')}`)
    }
    const meta = AI_PROVIDER_META[provider]

    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
    if (meta.keyRequired && !apiKey) return bad(`Enter your ${meta.label} API key.`)
    if (apiKey.length > 1000) return bad('That key is too long.')

    let baseUrl: string | null = null
    if (meta.customBaseUrl) {
      baseUrl = normalizeBaseUrl(typeof body.base_url === 'string' ? body.base_url : '')
      if (!baseUrl) return bad('Enter the base URL of your model server (http:// or https://).')
      const blocked = await checkOutboundAiUrl(baseUrl)
      if (blocked) return bad(blocked)
    }

    const { error } = await saveProviderKey(supabase, {
      accountId,
      userId,
      provider,
      apiKey,
      baseUrl,
    })
    if (error) return NextResponse.json({ error }, { status: 500 })

    // Keep the active config in step when this is its provider/endpoint.
    const { data: active } = await supabase
      .from('ai_configs')
      .select('provider, base_url')
      .eq('account_id', accountId)
      .maybeSingle()
    if (active && active.provider === provider && (active.base_url ?? null) === baseUrl) {
      await supabase
        .from('ai_configs')
        .update({ api_key: apiKey ? encrypt(apiKey) : null })
        .eq('account_id', accountId)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/** DELETE ?provider=x — forget a saved key. The active provider's key
 *  can't be removed here (that would silently break the agent); switch
 *  provider in Setup or remove the configuration first. */
export async function DELETE(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-keys:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const provider = new URL(request.url).searchParams.get('provider')
    if (!isAiProvider(provider)) return bad('Unknown provider')

    const { data: active } = await supabase
      .from('ai_configs')
      .select('provider')
      .eq('account_id', accountId)
      .maybeSingle()
    if (active?.provider === provider) {
      return bad(
        `${AI_PROVIDER_META[provider].label} is the active provider. Switch provider in Setup first.`,
      )
    }

    const { error } = await supabase
      .from('ai_provider_keys')
      .delete()
      .eq('account_id', accountId)
      .eq('provider', provider)
    if (error) {
      console.error('[ai/keys DELETE] error:', error)
      return NextResponse.json({ error: 'Failed to remove the key' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
