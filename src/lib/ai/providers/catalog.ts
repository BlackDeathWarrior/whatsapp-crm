// ============================================================
// Provider catalog — the single list of LLM providers the agent can
// run on. Shared by the settings form (labels, placeholders, which
// fields to show) and the server (endpoint, request shape, whether a
// key is required).
//
// Everything except Anthropic speaks the OpenAI Chat Completions
// dialect, so they all go through one adapter
// (`providers/openai-compatible.ts`) and differ only by base URL and a
// couple of request quirks. `local` is the escape hatch: any
// OpenAI-compatible server at a URL the admin supplies — Ollama,
// LM Studio, vLLM, LocalAI, llama.cpp's server, or a proxy.
//
// No Node-only imports here: this file ships to the browser.
// ============================================================

export const AI_PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'mistral',
  'xai',
  'nvidia',
  'local',
] as const

export type AiProvider = (typeof AI_PROVIDERS)[number]

export interface AiProviderMeta {
  label: string
  /** Pre-filled model ID. Editable free text in the UI — never an
   *  allow-list; model IDs churn faster than this file. */
  defaultModel: string
  keyPlaceholder: string
  /** False only for self-hosted servers, which usually run keyless. */
  keyRequired: boolean
  /** Default OpenAI-compatible base URL (no trailing slash, no
   *  `/chat/completions`). Null for Anthropic's native API. */
  baseUrl: string | null
  /** When true the admin supplies/overrides the base URL. */
  customBaseUrl: boolean
  /** Name of the output-cap parameter. OpenAI's current models reject
   *  `max_tokens`; most compatible servers only know `max_tokens`. */
  tokenParam: 'max_completion_tokens' | 'max_tokens'
  /** Where to get a key — shown as a hint link in the form. */
  keyUrl: string | null
}

export const AI_PROVIDER_META: Record<AiProvider, AiProviderMeta> = {
  openai: {
    label: 'OpenAI',
    defaultModel: 'gpt-5.4-mini',
    keyPlaceholder: 'sk-...',
    keyRequired: true,
    baseUrl: 'https://api.openai.com/v1',
    customBaseUrl: false,
    tokenParam: 'max_completion_tokens',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-haiku-4-5-20251001',
    keyPlaceholder: 'sk-ant-...',
    keyRequired: true,
    baseUrl: null,
    customBaseUrl: false,
    tokenParam: 'max_tokens',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza...',
    keyRequired: true,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    customBaseUrl: false,
    tokenParam: 'max_tokens',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    keyPlaceholder: 'sk-or-...',
    keyRequired: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    customBaseUrl: false,
    tokenParam: 'max_tokens',
    keyUrl: 'https://openrouter.ai/keys',
  },
  mistral: {
    label: 'Mistral AI',
    defaultModel: 'mistral-small-latest',
    keyPlaceholder: 'Mistral API key',
    keyRequired: true,
    baseUrl: 'https://api.mistral.ai/v1',
    customBaseUrl: false,
    tokenParam: 'max_tokens',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  xai: {
    label: 'xAI (Grok)',
    defaultModel: 'grok-3-mini',
    keyPlaceholder: 'xai-...',
    keyRequired: true,
    baseUrl: 'https://api.x.ai/v1',
    customBaseUrl: false,
    tokenParam: 'max_tokens',
    keyUrl: 'https://console.x.ai',
  },
  nvidia: {
    label: 'NVIDIA NIM',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    keyPlaceholder: 'nvapi-...',
    keyRequired: true,
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    customBaseUrl: false,
    tokenParam: 'max_tokens',
    keyUrl: 'https://build.nvidia.com',
  },
  local: {
    label: 'Local / self-hosted (OpenAI-compatible)',
    defaultModel: 'llama3.2',
    keyPlaceholder: 'Optional',
    keyRequired: false,
    baseUrl: 'http://localhost:11434/v1',
    customBaseUrl: true,
    tokenParam: 'max_tokens',
    keyUrl: null,
  },
}

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value)
}

/** Normalize an admin-typed base URL: trim, drop trailing slashes and a
 *  pasted `/chat/completions` suffix. Returns null when not http(s). */
export function normalizeBaseUrl(raw: string): string | null {
  let value = raw.trim().replace(/\/+$/, '')
  value = value.replace(/\/chat\/completions$/i, '')
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return value
  } catch {
    return null
  }
}
