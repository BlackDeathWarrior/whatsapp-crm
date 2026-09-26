import { isDeliverableUrl } from '@/lib/webhooks/ssrf'

// ============================================================
// Guard for admin-supplied URLs the server calls on the AI path: a
// self-hosted model's base URL, and custom MCP server URLs.
//
// Same SSRF concern as webhooks (see lib/webhooks/ssrf.ts): an account
// admin types the URL, our server makes the request. On a shared
// instance that would let any account probe the host's internal
// network, so private/loopback targets are refused by default.
//
// But "run the model next to the CRM" (Ollama on localhost, a vLLM box
// on the LAN, an MCP server in the same docker network) is the whole
// point of the local provider on a single-tenant self-host. The
// operator opts in with AI_ALLOW_PRIVATE_URLS=true — an env var, so
// only whoever runs the instance can widen it, never an account admin.
// ============================================================

export function privateAiUrlsAllowed(): boolean {
  return process.env.AI_ALLOW_PRIVATE_URLS === 'true'
}

export const PRIVATE_URL_BLOCKED_MESSAGE =
  'This URL points to a private or local network address. Set AI_ALLOW_PRIVATE_URLS=true in the server environment to allow local model servers and MCP servers.'

/**
 * Null when `rawUrl` may be called, otherwise a user-facing reason.
 * Requires http(s); private/loopback hosts only when the operator has
 * set AI_ALLOW_PRIVATE_URLS=true.
 */
export async function checkOutboundAiUrl(rawUrl: string): Promise<string | null> {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return 'Enter a valid URL.'
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'URL must start with http:// or https://'
  }
  if (url.username || url.password) {
    return 'Put credentials in a header, not in the URL.'
  }
  if (privateAiUrlsAllowed()) return null
  return (await isDeliverableUrl(rawUrl)) ? null : PRIVATE_URL_BLOCKED_MESSAGE
}
