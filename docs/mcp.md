# MCP server

wacrm ships a [Model Context Protocol](https://modelcontextprotocol.io)
server so you can drive your CRM from AI assistants — Claude Desktop,
Claude Code, Cursor, and any other MCP client — in natural language:

> "How many conversations are still open today?"
> "Show the last five messages with +1 415 555 0123."
> "Send the `order_update` template to that contact."

It lives in [`mcp-server/`](../mcp-server) and is published to npm as
[`wacrm-mcp`](https://www.npmjs.com/package/wacrm-mcp). Under the hood
it's a thin wrapper over the [public API](./public-api.md), so every
request is authenticated and scoped by your instance exactly like any
other API call.

## Quick start

1. Create an API key in the dashboard: **Settings → API keys**. Grant
   only the scopes your assistant needs (a read-only assistant only
   needs the `*:read` scopes).
2. Add the server to your MCP client config:

   ```jsonc
   {
     "mcpServers": {
       "wacrm": {
         "command": "npx",
         "args": ["-y", "wacrm-mcp"],
         "env": {
           "WACRM_BASE_URL": "https://crm.example.com",
           "WACRM_API_KEY": "wacrm_live_xxxxxxxxxxxxxxxxxxxxxxxx"
         }
       }
     }
   }
   ```

That's **read-only** — the safe default. To let the assistant change
data or send messages, add `"WACRM_ENABLE_WRITES": "true"` (and
`"WACRM_ENABLE_BROADCASTS": "true"` for mass sends) to `env`.

## What it exposes

- **Reads (always on):** `whoami`, contacts (list/get), conversations
  (list/get), messages (list), broadcast status.
- **Writes (opt-in):** send a message, create/update a contact.
- **Broadcasts (opt-in):** launch a template broadcast — requires an
  explicit `confirm` and is marked destructive.

## Safety

Because sending WhatsApp messages is a real side effect, the server is
**read-only until you opt in**, layered on top of the API key's own
scopes. Give an assistant a read-only key and read-only config and it
physically cannot send anything. See the
[server README](../mcp-server/README.md) for the full tool list and
safety model.

## Config generator

**Settings → MCP servers → Connect AI clients to this CRM** builds the
JSON above for you: it fills in this instance's URL, lets you paste an
API key (used only in your browser, never stored), and toggles
writes/broadcasts. It can also include your custom servers (below).

## Custom MCP servers for the AI agent

The other direction: give wacrm's own AI agent (inbox drafts,
auto-reply, Playground) tools from **your** MCP servers — an inventory
lookup, order status, a booking system.

1. **Settings → MCP servers → Add server.** Enter a name, the server's
   URL, and any auth headers (e.g. `Authorization: Bearer ...`).
   Headers are stored AES-256-GCM-encrypted and never shown again.
2. **Test connection** lists the tools the server exposes.
3. Leave **Available to AI agent** on. Every enabled server's tools are
   offered to the model on each draft/auto-reply, prefixed with the
   server name (`inventory__get_stock`).

Notes:

- Remote servers over **Streamable HTTP** only. Command-based (stdio)
  servers can't be spawned by a web deployment.
- The model gets up to 4 tool round-trips per reply, then must answer.
  A server that's down is skipped; the reply still goes out.
- Tool calling needs a model that supports it. If the provider rejects
  tool definitions, wacrm retries without tools.
- Auto-reply runs with no human in the loop: only connect tools you are
  comfortable letting the bot call on its own.
- URLs on `localhost` / private networks are refused unless the server
  sets `AI_ALLOW_PRIVATE_URLS=true` (see `.env.local.example`).
