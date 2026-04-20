# Alternative hosts

[Hostinger Managed Node.js Hosting](./deployment-hostinger.md) is the
recommended default — zero-ops, Git deploy from hPanel, AutoSSL. But
WaCRM is a plain Next.js app; any host that runs long-running
Node.js 20+ will work. This page is a quick sketch for the common
alternatives. Each block assumes you've already completed
[Supabase setup](./supabase-setup.md) and [WhatsApp setup](./whatsapp-setup.md).

## Vercel

1. Push your fork to GitHub.
2. <https://vercel.com/new> → **Import Git Repository** → pick the fork.
3. **Environment Variables**: paste every value from
   [`environment-variables.md`](./environment-variables.md). Mark the
   `NEXT_PUBLIC_*` ones as available at build time (Vercel does this
   automatically).
4. Deploy. Vercel handles HTTPS, preview URLs, and edge routing.
5. Attach your domain (Vercel → Project → Settings → Domains).
6. Update Meta → WhatsApp → Configuration → Webhook to
   `https://<your-domain>/api/whatsapp/webhook`.

**Automations cron**: Vercel has built-in cron (Pro plan). Add to
[`vercel.json`](https://vercel.com/docs/cron-jobs):

```json
{
  "crons": [
    { "path": "/api/automations/cron", "schedule": "* * * * *" }
  ]
}
```

Vercel cron hits the endpoint server-to-server but **doesn't let you
send custom headers**. The simplest path is to skip `x-cron-secret`
and gate on Vercel's `x-vercel-cron` header instead:

```ts
// adjust src/app/api/automations/cron/route.ts
if (request.headers.get('x-vercel-cron') !== '1' &&
    request.headers.get('x-cron-secret') !== process.env.AUTOMATION_CRON_SECRET) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Trade-offs**:

- ✅ Fastest onboarding, preview URLs per PR, global CDN.
- ⚠️ Serverless functions have cold starts — inbound webhooks from
  Meta may occasionally take an extra second on the first hit.
- ⚠️ The in-memory [rate limiter](./architecture.md#security-primitives)
  is per-function-instance, so effective limits multiply across
  regions. Swap for Upstash Redis if that matters.

## Railway

1. <https://railway.app/new> → **Deploy from GitHub repo** → pick your
   fork.
2. Railway detects Next.js automatically. Default build +
   start commands are correct.
3. **Variables**: add every value from
   [`environment-variables.md`](./environment-variables.md).
4. **Generate Domain** under Settings, or attach a custom domain.
5. Update Meta webhook URL, same as above.

**Automations cron**: Railway has built-in cron. Services → **+ Cron**:

- Schedule: `* * * * *`
- Command:
  ```
  curl -s -H "x-cron-secret: $AUTOMATION_CRON_SECRET" https://<your-domain>/api/automations/cron
  ```

**Trade-offs**:

- ✅ Long-running processes (no cold starts), built-in Redis if you
  need one, usage-based pricing.
- ⚠️ No preview deploys per PR out of the box (paid feature).

## Raw VPS (any provider)

Any Ubuntu 22/24 or Debian 12 VPS with 2 GB+ RAM works. The
Hostinger VPS walkthrough in
[`deployment-hostinger.md`](./deployment-hostinger.md) (at the bottom,
"When to reach for a VPS instead") gives the exact commands — PM2 +
nginx + certbot. Same commands apply on DigitalOcean, Hetzner, Linode,
AWS Lightsail, OVH, etc. Only the billing dashboard changes.

Systemd cron is the obvious scheduler:

```cron
* * * * * curl -s -H "x-cron-secret: $AUTOMATION_CRON_SECRET" https://<your-domain>/api/automations/cron > /dev/null
```

**Trade-offs**:

- ✅ Most control (custom binaries, private networking, your own
  observability stack), cheapest at scale.
- ⚠️ You are the ops team. Patching, TLS renewal, log rotation, backup
  to S3 — all you.

## Self-hosted Docker / Kubernetes

No official image is shipped. If you containerise, the app is a
plain Next.js standalone build:

```Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["npm", "start"]
```

Pass env vars via `--env-file` or a Kubernetes Secret. The cron ping
stays an external concern (K8s CronJob, a sidecar, or an external
uptime monitor).

## Which should I pick?

| If you want… | Pick |
|---|---|
| Zero-ops, lowest-friction deploy | **Hostinger Managed Node.js** |
| Preview URLs per PR, global edge | **Vercel** |
| Long-running processes, simple cron | **Railway** |
| Full control, cheapest at scale, you're OK on ops | **VPS / self-host** |
| Air-gapped or multi-region with your own K8s | **Docker / Kubernetes** |

None of these are one-way doors — they all run the same fork of the
same Next.js app.
