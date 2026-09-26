import { decrypt } from '@/lib/whatsapp/encryption'
import { checkOutboundAiUrl } from './outbound-url'
import {
  AI_PROVIDERS,
  AI_PROVIDER_META,
  isAiProvider,
  normalizeBaseUrl,
  type AiProvider,
} from './providers/catalog'

// ============================================================
// Parse provider/model/key/base URL from a settings request (save or
// "Test key") and decide which key to use.
//
// Key reuse rule: the stored key is only reused when the provider AND
// base URL are unchanged. Otherwise switching to the `local` provider
// with a URL you control and leaving the key field blank would send the
// saved key to that URL — any admin could exfiltrate a key they were
// never shown. A changed endpoint therefore needs the key re-entered
// (or none, for keyless self-hosted servers).
// ============================================================

export interface StoredCredentials {
  provider: string
  api_key: string | null
  base_url: string | null
}

export type ResolvedCredentials =
  | {
      ok: true
      provider: AiProvider
      model: string
      baseUrl: string | null
      /** Plaintext key to call the provider with ('' = keyless). */
      apiKey: string
      /** What to do with the stored `api_key` column on save. */
      keyAction: 'set' | 'keep' | 'clear'
    }
  | { ok: false; error: string }

/**
 * `saved` is the per-provider key store entry (AI Agents → API keys)
 * for the requested provider, if the caller looked it up. It's used
 * when the form sent no key and the active config's key doesn't apply
 * — subject to the same endpoint rule (a `local` entry only for its own
 * base URL).
 */
export async function resolveCredentials(
  body: Record<string, unknown>,
  existing: StoredCredentials | null,
  saved: { api_key: string | null; base_url: string | null } | null = null,
): Promise<ResolvedCredentials> {
  const provider = body.provider
  if (!isAiProvider(provider)) {
    return { ok: false, error: `provider must be one of: ${AI_PROVIDERS.join(', ')}` }
  }
  const meta = AI_PROVIDER_META[provider]

  const model = typeof body.model === 'string' ? body.model.trim() : ''
  if (!model) return { ok: false, error: 'model is required' }

  let baseUrl: string | null = null
  if (meta.customBaseUrl) {
    baseUrl = normalizeBaseUrl(typeof body.base_url === 'string' ? body.base_url : '')
    if (!baseUrl) {
      return { ok: false, error: 'Enter the base URL of your model server (http:// or https://).' }
    }
    const blocked = await checkOutboundAiUrl(baseUrl)
    if (blocked) return { ok: false, error: blocked }
  }

  const rawKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
  if (rawKey) {
    return { ok: true, provider, model, baseUrl, apiKey: rawKey, keyAction: 'set' }
  }

  const sameEndpoint =
    !!existing && existing.provider === provider && (existing.base_url ?? null) === baseUrl

  if (sameEndpoint && existing?.api_key) {
    try {
      return {
        ok: true,
        provider,
        model,
        baseUrl,
        apiKey: decrypt(existing.api_key),
        keyAction: 'keep',
      }
    } catch {
      return { ok: false, error: 'Stored API key could not be decrypted — re-enter your key.' }
    }
  }

  const savedMatches = !!saved && (!meta.customBaseUrl || (saved.base_url ?? null) === baseUrl)
  if (savedMatches && saved?.api_key) {
    try {
      return {
        ok: true,
        provider,
        model,
        baseUrl,
        apiKey: decrypt(saved.api_key),
        // Copied into ai_configs on save.
        keyAction: 'set',
      }
    } catch {
      return { ok: false, error: `The saved ${meta.label} key could not be decrypted — re-enter it under API keys.` }
    }
  }

  if (!meta.keyRequired) {
    return { ok: true, provider, model, baseUrl, apiKey: '', keyAction: 'clear' }
  }

  return {
    ok: false,
    error: `No ${meta.label} key yet — enter one here or save it under AI Agents → API keys.`,
  }
}
