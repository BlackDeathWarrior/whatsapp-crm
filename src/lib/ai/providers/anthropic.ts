import { AiError, type AiUsage, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS, MAX_TOOL_ROUNDS } from '../defaults'
import {
  addUsage,
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  runTool,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicBlock {
  type?: string
  text?: string
  id?: string
  name?: string
  input?: unknown
}

interface AnthropicResponse {
  content?: AnthropicBlock[]
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Record<string, unknown>[]
}

/**
 * Anthropic's Messages API requires strictly alternating roles that
 * begin with `user`. Merge consecutive turns, then drop any leading
 * assistant turns (an agent greeting before the customer said anything)
 * so the transcript always starts on the customer. Guarantees a valid,
 * non-empty payload.
 */
function normalizeForAnthropic(messages: ChatMessage[]): ChatMessage[] {
  const merged = mergeConsecutive(messages)
  while (merged.length > 0 && merged[0].role === 'assistant') {
    merged.shift()
  }
  if (merged.length === 0) {
    return [{ role: 'user', content: '(The customer has not sent a message yet.)' }]
  }
  return merged
}

/**
 * Call Anthropic's Messages endpoint with the caller's own key. When a
 * toolset is supplied, runs the tool loop (`tool_use` → `tool_result`)
 * for up to MAX_TOOL_ROUNDS rounds. Returns the final assistant text +
 * summed token usage (handoff parsing happens in `generateReply`).
 */
export async function generateAnthropic(args: ProviderArgs): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, toolset } = args

  const tools =
    toolset && toolset.tools.length > 0
      ? toolset.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }))
      : null

  const convo: AnthropicMessage[] = normalizeForAnthropic(messages)
  let toolRounds = 0
  let usage: AiUsage | null = null

  for (;;) {
    const body: Record<string, unknown> = {
      model,
      system: systemPrompt,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: convo,
    }
    if (tools) {
      body.tools = tools
      body.tool_choice = { type: toolRounds >= MAX_TOOL_ROUNDS ? 'none' : 'auto' }
    }

    let res: Response
    try {
      res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw toNetworkError(err)
    }

    if (!res.ok) {
      throw await providerHttpError('Anthropic', res)
    }

    const data = (await res.json().catch(() => null)) as AnthropicResponse | null
    // Anthropic reports input/output but no total — normalizeUsage sums.
    usage = addUsage(
      usage,
      normalizeUsage({
        prompt: data?.usage?.input_tokens,
        completion: data?.usage?.output_tokens,
      }),
    )

    const blocks = data?.content ?? []
    const toolUses = blocks.filter((b) => b.type === 'tool_use' && b.id && b.name)

    if (tools && toolset && toolUses.length > 0 && toolRounds < MAX_TOOL_ROUNDS) {
      toolRounds++
      convo.push({ role: 'assistant', content: blocks as Record<string, unknown>[] })
      const results: Record<string, unknown>[] = []
      for (const use of toolUses) {
        const input =
          use.input && typeof use.input === 'object' && !Array.isArray(use.input)
            ? (use.input as Record<string, unknown>)
            : {}
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: await runTool(toolset, use.name!, input),
        })
      }
      convo.push({ role: 'user', content: results })
      continue
    }

    const text = blocks
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim()
    if (!text) {
      throw new AiError('Anthropic returned an empty response.', {
        code: 'empty_response',
      })
    }
    return { text, usage }
  }
}
