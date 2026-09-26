import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateReply, parseGeneration } from './generate'
import { AiError, type AiConfig } from './types'

function config(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    baseUrl: null,
    systemPrompt: null,
    isActive: true,
    autoReplyEnabled: false,
    autoReplyMaxPerConversation: 3,
    handoffAgentId: null,
    embeddingsApiKey: null,
    ...overrides,
  }
}

function okResponse(json: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => json,
  } as unknown as Response
}

function errResponse(status: number, json: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => json,
  } as unknown as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => vi.unstubAllGlobals())

describe('parseGeneration', () => {
  it('returns text with no handoff', () => {
    expect(parseGeneration('Hello there')).toEqual({
      text: 'Hello there',
      handoff: false,
      usage: null,
    })
  })

  it('detects + strips the handoff sentinel', () => {
    expect(parseGeneration('[[HANDOFF]]')).toEqual({
      text: '',
      handoff: true,
      usage: null,
    })
    expect(parseGeneration('Let me get a human [[HANDOFF]]')).toEqual({
      text: 'Let me get a human',
      handoff: true,
      usage: null,
    })
  })

  it('passes usage straight through', () => {
    const usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    expect(parseGeneration('Hi', usage)).toEqual({
      text: 'Hi',
      handoff: false,
      usage,
    })
  })
})

describe('generateReply — OpenAI', () => {
  it('calls the chat completions endpoint and returns the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        choices: [{ message: { content: 'Sure — happy to help!' } }],
        usage: { prompt_tokens: 42, completion_tokens: 8, total_tokens: 50 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'openai' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(res).toEqual({
      text: 'Sure — happy to help!',
      handoff: false,
      usage: { promptTokens: 42, completionTokens: 8, totalTokens: 50 },
    })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('api.openai.com')
    expect(opts.headers.Authorization).toBe('Bearer sk-test')
  })

  it('maps a 401 to an invalid_key AiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        errResponse(401, { error: { message: 'Incorrect API key' } }),
      ),
    )

    await expect(
      generateReply({
        config: config(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_key', status: 401 })
  })

  it('throws on an empty completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: '' } }] })),
    )
    await expect(
      generateReply({
        config: config(),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toBeInstanceOf(AiError)
  })
})

describe('generateReply — Anthropic', () => {
  it('calls the messages endpoint with the version header and parses text blocks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        content: [{ type: 'text', text: 'Hi there!' }],
        usage: { input_tokens: 30, output_tokens: 6 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'anthropic', apiKey: 'sk-ant-x' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hello' }],
    })

    // Anthropic reports input/output only — total is summed by normalizeUsage.
    expect(res).toEqual({
      text: 'Hi there!',
      handoff: false,
      usage: { promptTokens: 30, completionTokens: 6, totalTokens: 36 },
    })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('api.anthropic.com')
    expect(opts.headers['x-api-key']).toBe('sk-ant-x')
    expect(opts.headers['anthropic-version']).toBeTruthy()
  })

  it('detects handoff in the model output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        okResponse({ content: [{ type: 'text', text: '[[HANDOFF]]' }] }),
      ),
    )
    const res = await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'I want to speak to a person' }],
    })
    expect(res.handoff).toBe(true)
    expect(res.text).toBe('')
  })

  it('drops a leading assistant turn so the payload starts on the customer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ content: [{ type: 'text', text: 'ok' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [
        { role: 'assistant', content: 'Welcome!' },
        { role: 'user', content: 'Hi' },
      ],
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages).toHaveLength(1)
  })
})

describe('generateReply — OpenAI-compatible providers', () => {
  it.each([
    ['gemini', 'generativelanguage.googleapis.com/v1beta/openai/chat/completions'],
    ['openrouter', 'openrouter.ai/api/v1/chat/completions'],
    ['mistral', 'api.mistral.ai/v1/chat/completions'],
    ['xai', 'api.x.ai/v1/chat/completions'],
    ['nvidia', 'integrate.api.nvidia.com/v1/chat/completions'],
  ] as const)('routes %s to its endpoint with max_tokens', async (provider, endpoint) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ choices: [{ message: { content: 'ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    await generateReply({
      config: config({ provider }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://${endpoint}`)
    const body = JSON.parse(opts.body)
    expect(body.max_tokens).toBeGreaterThan(0)
    expect(body.max_completion_tokens).toBeUndefined()
  })

  it('refuses a private base URL for the local provider unless allowed', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      generateReply({
        config: config({ provider: 'local', apiKey: '', baseUrl: 'http://127.0.0.1:11434/v1' }),
        systemPrompt: 'sys',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toMatchObject({ code: 'base_url_blocked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('calls a keyless local server when AI_ALLOW_PRIVATE_URLS=true', async () => {
    vi.stubEnv('AI_ALLOW_PRIVATE_URLS', 'true')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse({ choices: [{ message: { content: 'local ok' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'local', apiKey: '', baseUrl: 'http://localhost:11434/v1/' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(res.text).toBe('local ok')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:11434/v1/chat/completions')
    expect(opts.headers.Authorization).toBeUndefined()
    vi.unstubAllEnvs()
  })
})

describe('generateReply — tool calling', () => {
  const toolset = () => ({
    tools: [
      {
        name: 'shop__stock',
        description: 'Check stock',
        inputSchema: { type: 'object', properties: { sku: { type: 'string' } } },
      },
    ],
    call: vi.fn().mockResolvedValue('3 in stock'),
  })

  it('runs the OpenAI-style tool loop and sums usage', async () => {
    const tools = toolset()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'shop__stock', arguments: '{"sku":"A1"}' },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        }),
      )
      .mockResolvedValueOnce(
        okResponse({
          choices: [{ message: { content: 'We have 3 left!' } }],
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config(),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Is A1 in stock?' }],
      toolset: tools,
    })

    expect(tools.call).toHaveBeenCalledWith('shop__stock', { sku: 'A1' })
    expect(res.text).toBe('We have 3 left!')
    expect(res.usage).toEqual({ promptTokens: 30, completionTokens: 7, totalTokens: 37 })
    const second = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(second.messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '3 in stock',
    })
  })

  it('retries without tools when the model rejects them', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(400, { error: { message: 'tools not supported' } }))
      .mockResolvedValueOnce(okResponse({ choices: [{ message: { content: 'plain' } }] }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'mistral' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'Hi' }],
      toolset: toolset(),
    })

    expect(res.text).toBe('plain')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).tools).toBeUndefined()
  })

  it('runs the Anthropic tool_use → tool_result loop', async () => {
    const tools = toolset()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okResponse({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'tu_1', name: 'shop__stock', input: { sku: 'B2' } }],
        }),
      )
      .mockResolvedValueOnce(okResponse({ content: [{ type: 'text', text: 'Yes, 3.' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await generateReply({
      config: config({ provider: 'anthropic' }),
      systemPrompt: 'sys',
      messages: [{ role: 'user', content: 'B2?' }],
      toolset: tools,
    })

    expect(res.text).toBe('Yes, 3.')
    expect(tools.call).toHaveBeenCalledWith('shop__stock', { sku: 'B2' })
    const second = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(second.messages.at(-1)).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '3 in stock' }],
    })
  })
})
