# WaCRM

Self-hostable WhatsApp CRM — shared inbox, contacts, sales pipelines,
broadcasts, and no-code automations — built on Next.js 16 and Supabase.

- **Live demo / marketing site**: [`/`](./src/app/page.tsx)
- **Source**: <https://github.com/ArnasDon/wacrm>

## Quick start

```bash
git clone https://github.com/<your-username>/wacrm.git
cd wacrm
npm install
cp .env.local.example .env.local
# Fill in Supabase keys + ENCRYPTION_KEY, then:
npm run dev
```

Open <http://localhost:3000>.

For the full setup — Supabase migrations, WhatsApp Business API config,
production deploy on Hostinger — see [`docs/`](./docs/README.md).

## Documentation

- [Getting started](./docs/getting-started.md)
- [Supabase setup](./docs/supabase-setup.md)
- [WhatsApp setup](./docs/whatsapp-setup.md)
- [Environment variables](./docs/environment-variables.md)
- [Deploy on Hostinger](./docs/deployment-hostinger.md)
- [Automations cron](./docs/automations-and-cron.md)
- [Troubleshooting](./docs/troubleshooting.md)

## Stack

- **App** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Data** — Supabase (Postgres + Auth + RLS).
- **WhatsApp** — Meta Cloud API (official WhatsApp Business API).

## License

MIT — fork it, brand it, host it. Pull requests welcome.
