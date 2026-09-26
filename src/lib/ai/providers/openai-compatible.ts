import { AiError, type AiProvider, type AiUsage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS, MAX_TOOL_ROUNDS } from '../defaults'
import { checkOutboundAiUrl } from '../outbound-url'
import { AI_PROVIDER_META, normalizeBaseUrl } from './catalog'
import {
  addUsage,
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  runTool,
  toNetworkError,
  type ProviderArgs,
} from './shared'

// ============================================================
// OpenAI Chat Completions adapter — used for every provider that speaks
// that dialect: OpenAI itself, Gemini (OpenAI-compat endpoint),
// OpenRouter, Mistral, xAI, NVIDIA NIM, and self-hosted servers. The
// catalog supplies the base URL and the output-cap parameter name.
// ============================================================

export interface OpenAiCompatibleArgs extends ProviderArgs {
  provider: AiProvider
  /** Admin-supplied base URL (only honoured for `customBaseUrl`
   *  providers). */
  baseUrl: string | null
}

interface OaToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OaToolCall[]
  tool_call_id?: string
}

interface OpenAiResponse {
  choices?: {
    message?: {
      content?: string | { type?: string; text?: string }[] | null
      tool_calls?: OaToolCall[]
    }
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

/** Resolve (and for admin-supplied URLs, SSRF-check) the endpoint. */
async function resolveEndpoint(provider: AiProvider, baseUrl: string | null): Promise<string> {
  const meta = AI_PROVIDER_META[provider]
  if (!meta.customBaseUrl) return `${meta.baseUrl}/chat/completions`

  const base = normalizeBaseUrl(baseUrl ?? meta.baseUrl ?? '')
  if (!base) {
    throw new AiError('Enter a valid base URL for your model server.', {
      code: 'invalid_base_url',
      status: 400,
    })
  }
  const blocked = await checkOutboundAiUrl(base)
  if (blocked) {
    throw new AiError(blocked, { code: 'base_url_blocked', status: 400 })
  }
  return `${base}/chat/completions`
}

/** Some servers return content as an array of parts rather than a string. */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && typeof p.text === 'string' ? p.text : ''))
      .join('')
  }
  return ''
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Call an OpenAI-compatible Chat Completions endpoint with the caller's
 * own key. When a toolset is supplied, runs the tool loop: the model may
 * call tools for up to MAX_TOOL_ROUNDS rounds, then must answer. Returns
 * the final assistant text + summed token usage (handoff parsing
 * happens in `generateReply`).
 */
export async function generateOpenAiCompatible(
  args: OpenAiCompatibleArgs,
): Promise<ProviderResult> {
  const { provider, apiKey, model, systemPrompt, messages, timeoutMs, toolset } = args
  const meta = AI_PROVIDER_META[provider]
  const url = await resolveEndpoint(provider, args.baseUrl)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (provider === 'openrouter') headers['X-Title'] = 'wacrm'

  const tools =
    toolset && toolset.tools.length > 0
      ? toolset.tools.map((t) => ({
          type: 'function' as const,
          function: { name: t.name, description: t.description, parameters: t.inputSchema },
        }))
      : null

  const convo: OaMessage[] = [
    { role: 'system', content: systemPrompt },
    ...mergeConsecutive(messages),
  ]

  let toolsEnabled = tools !== null
  let toolRounds = 0
  let usage: AiUsage | null = null

  for (;;) {
    const body: Record<string, unknown> = {
      model,
      messages: convo,
      [meta.tokenParam]: MAX_OUTPUT_TOKENS,
    }
    if (toolsEnabled) {
      body.tools = tools
      // Out of rounds: keep the tool definitions (the transcript already
      // references them) but forbid further calls.
      body.tool_choice = toolRounds >= MAX_TOOL_ROUNDS ? 'none' : 'auto'
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        // An admin-supplied URL must not 3xx-bounce to an internal host.
        redirect: meta.customBaseUrl ? 'manual' : 'follow',
      })
    } catch (err) {
      throw toNetworkError(err)
    }

    if (!res.ok) {
      // Plenty of models behind these endpoints don't support tool
      // calling and 400 on a `tools` param. Rather than fail every reply
      // because an MCP server is connected, drop the tools and retry once.
      if (res.status === 400 && toolsEnabled && toolRounds === 0) {
        console.warn(
          `[ai] ${meta.label} rejected tool definitions for model "${model}" — retrying without MCP tools.`,
        )
        toolsEnabled = false
        continue
      }
      throw await providerHttpError(meta.label, res)
    }

    const data = (await res.json().catch(() => null)) as OpenAiResponse | null
    usage = addUsage(
      usage,
      normalizeUsage({
        prompt: data?.usage?.prompt_tokens,
        completion: data?.usage?.completion_tokens,
        total: data?.usage?.total_tokens,
      }),
    )

    const message = data?.choices?.[0]?.message
    const toolCalls = message?.tool_calls ?? []

    if (toolsEnabled && toolset && toolCalls.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++
      convo.push({
        role: 'assistant',
        content: contentText(message?.content) || null,
        tool_calls: toolCalls,
      })
      for (const call of toolCalls) {
        const result = await runTool(
          toolset,
          call.function?.name ?? '',
          parseArgs(call.function?.arguments),
        )
        convo.push({ role: 'tool', tool_call_id: call.id, content: result })
      }
      continue
    }

    const text = contentText(message?.content)
    if (!text.trim()) {
      throw new AiError(`${meta.label} returned an empty response.`, {
        code: 'empty_response',
      })
    }
    return { text, usage }
  }
}
