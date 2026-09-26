import type { SupabaseClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/whatsapp/encryption'
import type { AiProvider } from './providers/catalog'

// ============================================================
// Per-provider key store (`ai_provider_keys`, migration 043).
//
// Lets an admin save a key for every provider (AI Agents → API keys)
// and switch the active provider in Setup without re-typing. The
// runtime path never reads this table — `ai_configs.api_key` is still
// the key in use; saving the config copies the chosen provider's key
// across (see `resolveCredentials`). Admin-only via RLS.
// ============================================================

export interface SavedProviderKey {
  provider: AiProvider
  /** Encrypted key, or null for a keyless local server. */
  api_key: string | null
  base_url: string | null
  updated_at: string
}

/** All saved keys for the account. Empty on any error (e.g. a non-admin
 *  caller, whom RLS hides the table from) — callers treat the store as
 *  a convenience, never a requirement. */
export async function loadProviderKeys(
  db: SupabaseClient,
  accountId: string,
): Promise<SavedProviderKey[]> {
  const { data, error } = await db
    .from('ai_provider_keys')
    .select('provider, api_key, base_url, updated_at')
    .eq('account_id', accountId)
  if (error) return []
  return (data ?? []) as SavedProviderKey[]
}

export async function loadProviderKey(
  db: SupabaseClient,
  accountId: string,
  provider: AiProvider,
): Promise<SavedProviderKey | null> {
  const { data, error } = await db
    .from('ai_provider_keys')
    .select('provider, api_key, base_url, updated_at')
    .eq('account_id', accountId)
    .eq('provider', provider)
    .maybeSingle()
  if (error) return null
  return (data as SavedProviderKey | null) ?? null
}

/** Insert or replace the saved key for one provider. */
export async function saveProviderKey(
  db: SupabaseClient,
  args: {
    accountId: string
    userId: string
    provider: AiProvider
    /** Plaintext; '' stores a keyless entry (local servers). */
    apiKey: string
    baseUrl: string | null
  },
): Promise<{ error: string | null }> {
  const { error } = await db.from('ai_provider_keys').upsert(
    {
      account_id: args.accountId,
      created_by: args.userId,
      provider: args.provider,
      api_key: args.apiKey ? encrypt(args.apiKey) : null,
      base_url: args.baseUrl,
    },
    { onConflict: 'account_id,provider' },
  )
  if (error) {
    console.error('[ai provider keys] save error:', error)
    return { error: 'Failed to save the API key' }
  }
  return { error: null }
}
