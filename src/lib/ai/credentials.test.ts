import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: (v: string) => `plain:${v}`,
}))

import { resolveCredentials } from './credentials'

const STORED = { provider: 'openai', api_key: 'enc', base_url: null }

afterEach(() => vi.unstubAllEnvs())

describe('resolveCredentials', () => {
  it('reuses the stored key for the same provider', async () => {
    const res = await resolveCredentials({ provider: 'openai', model: 'm' }, STORED)
    expect(res).toMatchObject({ ok: true, apiKey: 'plain:enc', keyAction: 'keep' })
  })

  it('does not reuse the stored key for a different provider', async () => {
    const res = await resolveCredentials({ provider: 'gemini', model: 'm' }, STORED)
    expect(res.ok).toBe(false)
  })

  it('never sends a stored key to a local base URL', async () => {
    vi.stubEnv('AI_ALLOW_PRIVATE_URLS', 'true')
    const res = await resolveCredentials(
      { provider: 'local', model: 'm', base_url: 'http://localhost:11434/v1' },
      STORED,
    )
    expect(res).toMatchObject({ ok: true, apiKey: '', keyAction: 'clear' })
  })

  it('does not reuse a local key when the base URL changes', async () => {
    vi.stubEnv('AI_ALLOW_PRIVATE_URLS', 'true')
    const res = await resolveCredentials(
      { provider: 'local', model: 'm', base_url: 'http://10.0.0.5:8000/v1' },
      { provider: 'local', api_key: 'enc', base_url: 'http://localhost:11434/v1' },
    )
    expect(res).toMatchObject({ ok: true, apiKey: '', keyAction: 'clear' })
  })

  it('reuses a local key for the same base URL', async () => {
    vi.stubEnv('AI_ALLOW_PRIVATE_URLS', 'true')
    const res = await resolveCredentials(
      { provider: 'local', model: 'm', base_url: 'http://localhost:11434/v1/' },
      { provider: 'local', api_key: 'enc', base_url: 'http://localhost:11434/v1' },
    )
    expect(res).toMatchObject({ ok: true, apiKey: 'plain:enc', keyAction: 'keep' })
  })

  it('blocks a private base URL by default', async () => {
    const res = await resolveCredentials(
      { provider: 'local', model: 'm', base_url: 'http://169.254.169.254/v1' },
      null,
    )
    expect(res.ok).toBe(false)
  })

  it('rejects an unknown provider', async () => {
    const res = await resolveCredentials({ provider: 'nope', model: 'm' }, null)
    expect(res.ok).toBe(false)
  })

  it('falls back to the saved key for a newly chosen provider', async () => {
    const res = await resolveCredentials({ provider: 'gemini', model: 'm' }, STORED, {
      api_key: 'gem',
      base_url: null,
    })
    expect(res).toMatchObject({ ok: true, apiKey: 'plain:gem', keyAction: 'set' })
  })

  it('only uses a saved local key for its own base URL', async () => {
    vi.stubEnv('AI_ALLOW_PRIVATE_URLS', 'true')
    const saved = { api_key: 'loc', base_url: 'http://localhost:11434/v1' }
    const same = await resolveCredentials(
      { provider: 'local', model: 'm', base_url: 'http://localhost:11434/v1' },
      STORED,
      saved,
    )
    expect(same).toMatchObject({ ok: true, apiKey: 'plain:loc' })
    const other = await resolveCredentials(
      { provider: 'local', model: 'm', base_url: 'http://10.0.0.9:8000/v1' },
      STORED,
      saved,
    )
    expect(other).toMatchObject({ ok: true, apiKey: '' })
  })

  it('uses a freshly typed key', async () => {
    const res = await resolveCredentials(
      { provider: 'xai', model: 'grok', api_key: ' xai-123 ' },
      STORED,
    )
    expect(res).toMatchObject({ ok: true, apiKey: 'xai-123', keyAction: 'set' })
  })
})
