import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/whatsapp/encryption', () => ({
  encrypt: (v: string) => v,
  decrypt: (v: string) => v,
}))

import { McpHttpClient, toolResultText } from './client'
import { agentToolName, parseHeadersInput } from './servers'

function jsonRes(body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

beforeEach(() => vi.stubEnv('AI_ALLOW_PRIVATE_URLS', 'true'))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('McpHttpClient', () => {
  it('handshakes, keeps the session id, and reads an SSE tool result', async () => {
    const sse =
      'event: message\n' +
      'data: {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"hello"}]}}\n\n'
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonRes(
          { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'demo' } } },
          { 'mcp-session-id': 'sess-1' },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(
        new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const client = new McpHttpClient(
      'http://localhost:9000/mcp',
      { Authorization: 'Bearer t' },
      5000,
    )
    expect(await client.connect()).toEqual({ serverName: 'demo' })
    expect(await client.callTool('greet', {})).toBe('hello')

    const callHeaders = fetchMock.mock.calls[2][1].headers
    expect(callHeaders['Mcp-Session-Id']).toBe('sess-1')
    expect(callHeaders.Authorization).toBe('Bearer t')
  })

  it('refuses private URLs unless the operator allows them', async () => {
    vi.stubEnv('AI_ALLOW_PRIVATE_URLS', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const client = new McpHttpClient('http://127.0.0.1/mcp', {}, 5000)
    await expect(client.connect()).rejects.toThrow(/private/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces a JSON-RPC error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonRes({ jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'bad init' } }),
      ),
    )
    const client = new McpHttpClient('http://localhost:9000/mcp', {}, 5000)
    await expect(client.connect()).rejects.toThrow(/bad init/)
  })
})

describe('toolResultText', () => {
  it('flags error results', () => {
    expect(toolResultText({ isError: true, content: [{ type: 'text', text: 'nope' }] })).toBe(
      'Tool error: nope',
    )
  })

  it('falls back to structured content', () => {
    expect(toolResultText({ content: [], structuredContent: { a: 1 } })).toBe('{"a":1}')
  })
})

describe('agentToolName', () => {
  it('produces provider-safe names', () => {
    expect(agentToolName('My Shop!', 'get.stock')).toBe('My_Shop__get_stock')
    expect(agentToolName('x', 'y'.repeat(100))).toHaveLength(64)
  })
})

describe('parseHeadersInput', () => {
  it('rejects reserved and malformed headers', () => {
    expect(parseHeadersInput({ 'Content-Type': 'x' })).toHaveProperty('error')
    expect(parseHeadersInput({ 'Bad Name': 'x' })).toHaveProperty('error')
    expect(parseHeadersInput({ Authorization: 'a\r\nb' })).toHaveProperty('error')
  })

  it('accepts normal headers', () => {
    expect(parseHeadersInput({ Authorization: 'Bearer t' })).toEqual({
      headers: { Authorization: 'Bearer t' },
    })
  })
})
