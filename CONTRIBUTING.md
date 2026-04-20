# Contributing to WaCRM

Thanks for the interest. This document is the short version; anything not
answered here, open a draft PR or an issue and we'll figure it out together.

## Before you start

- **Security issues do not belong in public issues** — see
  [SECURITY.md](./.github/SECURITY.md) for the private disclosure flow.
- For anything non-trivial, open an issue first so we can agree on the
  approach before you write the code. Small fixes and typo-level PRs can
  skip this step.

## Dev loop

```bash
git clone https://github.com/<your-fork>/wacrm.git
cd wacrm
cp .env.local.example .env.local   # fill in your Supabase + Meta creds
npm install
npm run dev
```

Full setup (Supabase migrations, WhatsApp Business API, deploy) lives in
[`docs/`](./docs/README.md).

### Scripts you'll use

| Command | What it does |
| --- | --- |
| `npm run dev` | Turbopack dev server on port 3000. |
| `npm run build` | Production build. Next also runs its own typecheck here. |
| `npm run typecheck` | `tsc --noEmit`. Fast TS-only pass. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier write. Run before committing. |

CI on every PR runs lint (non-blocking today), typecheck, and build.

## PR style

- **One logical change per PR.** A bug fix and a refactor in the same PR
  makes review harder and rollback riskier.
- Branch off the latest `main`. Don't push new commits to a merged branch —
  they end up orphaned.
- Commit messages: first line is a short, imperative summary (`fix(inbox):
  drop messages on URL change`). Body explains the *why*; the diff shows the
  *what*.
- Run `npm run typecheck` and `npm run format` locally before opening the
  PR — saves a round trip on CI.
- Fill in the [pull-request template](./.github/pull_request_template.md). A
  "Test plan" section the reviewer can actually tick off goes a long way.
- Update relevant docs in [`docs/`](./docs/README.md) when you change
  behaviour a forker needs to know about.

## Code style

- TypeScript, strict. No `any` unless there's a good reason + a comment.
- Prefer server components; mark client components with `"use client"` only
  when they genuinely need interactivity, state, or browser APIs.
- `@/` alias for every internal import. Relative imports are used only
  inside the same subfolder.
- No new dependencies without a note in the PR body explaining why; we try
  to keep the install lean.

## Review process

- @ArnasDon is the sole code owner today (see
  [.github/CODEOWNERS](./.github/CODEOWNERS)) and reviews every PR.
- Expect a response within a few days. Friendly ping after a week.
- Reviews are collaborative — "this looks wrong" means "let's talk about
  it", not "we're not merging this".

## Licensing

By contributing, you agree your contribution is licensed under the
[MIT License](./LICENSE), the same license as the rest of the project.
