-- ============================================================
-- 043_ai_providers_and_mcp
--
-- Two additions to the AI agent:
--
--   1. More LLM providers. `ai_configs.provider` (and the matching
--      column on `ai_usage_log`) was CHECK-limited to openai/anthropic.
--      It now also accepts gemini, openrouter, mistral, xai, nvidia and
--      local (any OpenAI-compatible server — Ollama, LM Studio, vLLM…).
--        - `base_url`: the admin-supplied endpoint for `local`; null for
--          hosted providers, which use their built-in endpoint.
--        - `api_key` becomes nullable: self-hosted servers usually run
--          keyless. The app still requires a key for hosted providers.
--
--      `ai_provider_keys` stores one encrypted key per provider so all
--      of them can be entered up front (AI Agents → API keys).
--
--   2. `mcp_servers` — custom remote MCP servers (Streamable HTTP) whose
--      tools the AI agent may call while drafting / auto-replying.
--      Auth headers are stored AES-256-GCM-encrypted (one JSON blob),
--      same scheme as the provider keys; the API returns only header
--      names. Same RLS shape as `ai_configs`: members read, admin+
--      write.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ---------- 1. providers ----------

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter', 'mistral', 'xai', 'nvidia', 'local'));

ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS base_url text;
ALTER TABLE ai_configs ALTER COLUMN api_key DROP NOT NULL;

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter', 'mistral', 'xai', 'nvidia', 'local'));

-- ---------- 1b. per-provider key store ----------
--
-- One saved key per provider per account, so an admin can enter keys
-- for every provider up front (AI Agents → API keys) and switch the
-- active provider in Setup without re-typing. `ai_configs.api_key`
-- stays the key actually used at runtime; saving the config copies the
-- chosen provider's key across. Keys are AES-256-GCM-encrypted.
-- Admin-only even for SELECT: nothing outside settings needs them.

CREATE TABLE IF NOT EXISTS ai_provider_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider    text NOT NULL
                CHECK (provider IN ('openai', 'anthropic', 'gemini', 'openrouter', 'mistral', 'xai', 'nvidia', 'local')),
  api_key     text,                 -- encrypted; null for a keyless local server
  base_url    text,                 -- `local` only
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider)
);

ALTER TABLE ai_provider_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_provider_keys_select ON ai_provider_keys;
CREATE POLICY ai_provider_keys_select ON ai_provider_keys FOR SELECT
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_provider_keys_insert ON ai_provider_keys;
CREATE POLICY ai_provider_keys_insert ON ai_provider_keys FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_provider_keys_update ON ai_provider_keys;
CREATE POLICY ai_provider_keys_update ON ai_provider_keys FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_provider_keys_delete ON ai_provider_keys;
CREATE POLICY ai_provider_keys_delete ON ai_provider_keys FOR DELETE
  USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION public.update_ai_provider_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_provider_keys_updated_at ON ai_provider_keys;
CREATE TRIGGER ai_provider_keys_updated_at
  BEFORE UPDATE ON ai_provider_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_provider_keys_updated_at();

-- Seed the store with each account's existing key.
INSERT INTO ai_provider_keys (account_id, provider, api_key, base_url, created_by)
SELECT account_id, provider, api_key, base_url, created_by
FROM ai_configs
WHERE api_key IS NOT NULL
ON CONFLICT (account_id, provider) DO NOTHING;

-- ---------- 2. custom MCP servers ----------

CREATE TABLE IF NOT EXISTS mcp_servers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  url         text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2000),
  headers     text,                                  -- AES-256-GCM-encrypted JSON object, or null
  enabled     boolean NOT NULL DEFAULT true,         -- offered to the AI agent
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_account ON mcp_servers(account_id);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcp_servers_select ON mcp_servers;
CREATE POLICY mcp_servers_select ON mcp_servers FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS mcp_servers_insert ON mcp_servers;
CREATE POLICY mcp_servers_insert ON mcp_servers FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS mcp_servers_update ON mcp_servers;
CREATE POLICY mcp_servers_update ON mcp_servers FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS mcp_servers_delete ON mcp_servers;
CREATE POLICY mcp_servers_delete ON mcp_servers FOR DELETE
  USING (is_account_member(account_id, 'admin'));

CREATE OR REPLACE FUNCTION public.update_mcp_servers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mcp_servers_updated_at ON mcp_servers;
CREATE TRIGGER mcp_servers_updated_at
  BEFORE UPDATE ON mcp_servers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_mcp_servers_updated_at();
