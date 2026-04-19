# Troubleshooting

The greatest hits. If your problem is not here, open an issue at
<https://github.com/ArnasDon/wacrm/issues>.

## Build-time

### `Error: ENCRYPTION_KEY must be 64 hex chars`

`ENCRYPTION_KEY` is missing or not the right length. Generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the output into `.env.local` / your production env.

### `Error: supabaseUrl is required`

`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is not set
at build time. On Hostinger / any Node host, make sure the env vars are
exported **before** `npm run build` runs.

### Next.js complains about missing framework docs

The repo's `AGENTS.md` pins contributors to the docs bundled in
`node_modules/next/dist/docs/` — that notice is for humans editing the
code, it does not affect your build.

## Auth

### Sign-up succeeds but the confirmation email never arrives

In Supabase → **Authentication → Providers → Email**, either:

- Configure a custom SMTP provider (recommended for production), or
- Temporarily turn off **Confirm email** while testing.

### Password-reset links point at `localhost:3000` in production

Set `NEXT_PUBLIC_SITE_URL` **and** add the same origin to Supabase →
**Authentication → URL Configuration → Redirect URLs**.

## WhatsApp

### Webhook verification fails in Meta

- The **verify token** in Meta must match exactly what you saved in
  **Settings → WhatsApp** inside WaCRM.
- The callback URL must be reachable without auth. Test it yourself:
  `curl 'https://crm.example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test'`
  should return `test`.
- If you set `META_APP_SECRET`, check the app secret matches — a bad
  secret causes 401s on inbound webhooks, but verification itself does
  not use it.

### Messages go out but nothing comes in

1. Confirm the webhook is **Subscribed** to `messages` under Meta →
   WhatsApp → Configuration.
2. Confirm the phone number is listed under **Recipients** during testing
   (test-number apps only deliver to whitelisted testers).
3. Check server logs — inbound webhooks hit
   `POST /api/whatsapp/webhook`. A 200 with no message row means the
   payload parsed successfully but didn't match any known contact's
   config — double-check `phone_number_id`.

### `Token decryption failed`

`ENCRYPTION_KEY` changed since the token was saved. Reconnect the
WhatsApp account from **Settings → WhatsApp** to re-encrypt with the
current key.

## Automations

### Wait steps never resume

The cron drain is not running. See
[automations-and-cron.md](./automations-and-cron.md).

Quick sanity check from your machine:

```bash
curl -s -H "x-cron-secret: <secret>" https://crm.example.com/api/automations/cron
```

If that returns `{"processed":N}` with N growing when a wait is due, the
endpoint is fine and the problem is just the schedule.

### An automation fires twice for the same message

Most likely two WaCRM instances share one Supabase project and both
receive the same webhook. The webhook handler deduplicates by Meta's
`wamid`, but only within a single deploy — split-brain setups can double
up. Either consolidate to one deploy or route the webhook to exactly one.

## Deploy

### `502 Bad Gateway` from nginx

- `pm2 status` — is the `wacrm` process up?
- `pm2 logs wacrm` — is the Node process crashing on boot (usually a
  missing env var)?
- `sudo nginx -t` — is the nginx config valid?

### Meta webhook works until the cert renews

Certbot renews in-place and reloads nginx. If you see a certificate error
right after renewal, restart nginx (`sudo systemctl restart nginx`) and
check `/var/log/letsencrypt/letsencrypt.log` for the last renew attempt.

## Still stuck?

Open an issue with:

- Environment (local / Hostinger / other).
- The exact error from server logs (`pm2 logs wacrm` or Next's dev output).
- What you were trying to do when it happened.
