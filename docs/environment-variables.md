# Environment variables

All runtime configuration lives in `.env.local` during development and in
your host's environment settings in production. `.env.local.example` is a
minimal template; the table below is the full reference.

## Required

| Variable                          | Where to find it                                                     | Notes                                                                 |
| --------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase → Project Settings → API → **Project URL**                  | Public. Shipped to the browser.                                       |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase → Project Settings → API → **anon / public** key            | Public. Relies on RLS for safety.                                     |
| `SUPABASE_SERVICE_ROLE_KEY`       | Supabase → Project Settings → API → **service_role** key             | **Secret.** Bypasses RLS. Used by webhook + admin routes only.        |
| `ENCRYPTION_KEY`                  | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | 64 hex chars (32 bytes, AES-256-CBC). **Rotating breaks existing tokens.** |
| `META_APP_SECRET`                 | Meta → App Settings → Basic → **App Secret**                         | Verifies the `X-Hub-Signature-256` HMAC on every inbound webhook. **Without it the webhook rejects every request** — a public deploy cannot receive messages until this is set. |

## Recommended

| Variable               | Purpose                                                                                  |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Canonical public URL (e.g., `https://crm.example.com`). Used for absolute URLs, sitemap, OG images. |

## Optional

| Variable                    | Purpose                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AUTOMATION_CRON_SECRET`    | Shared secret that protects `GET /api/automations/cron`. Required if you schedule the automations drain. See [automations-and-cron.md](./automations-and-cron.md). |

## Sample `.env.local`

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://abcd1234.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Meta App Secret — required for webhook signature verification
META_APP_SECRET=abcdef0123456789...

# Encryption — DO NOT change after first deploy
ENCRYPTION_KEY=3f9c0a7e4d8b2f1a6c5e8d4b9f0a2c6e8d4b9f0a2c6e8d4b9f0a2c6e8d4b9f0a

# Public URL
NEXT_PUBLIC_SITE_URL=https://crm.example.com

# Automation cron
AUTOMATION_CRON_SECRET=generate-a-long-random-string
```

## Security checklist

- Never commit `.env.local`. The repo already ignores it.
- On Hostinger Managed Node.js (and any other host), set env vars via the
  platform's **Environment variables** panel rather than writing them
  into a tracked file on disk.
- Rotate `SUPABASE_SERVICE_ROLE_KEY` if it leaks — Supabase lets you
  regenerate it under Project Settings → API.
- Treat `ENCRYPTION_KEY` like a database master key. Losing it means
  connected WhatsApp® accounts must reconnect; rotating it means the same.

## Next step

[Deploy on Hostinger →](./deployment-hostinger.md)
