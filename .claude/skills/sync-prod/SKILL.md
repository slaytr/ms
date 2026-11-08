---
name: sync-prod
description: Mirror the production Postgres database into the local dev database. Use when the user asks to sync, pull, refresh, or mirror prod data locally.
---

Sync local Postgres from production via `scripts/sync-from-prod.mjs`.

1. Check `.env.local` exists. If not, copy `.env.local.example` to it. If the
   local DB isn't running or migrated, run `npm run db:up` then
   `npm run migrate:local` first (retry migrate a few times, 2s apart, since a
   fresh container needs a moment).
2. Run `railway whoami`. If it fails, stop and tell the user to run
   `! railway login` themselves (needs a browser).
3. Run `npm run sync:prod` and show the per-table row counts.
4. The truncate + reload is one transaction, so a failure rolls back. Report
   any error verbatim and do not retry in a loop.

Safety:
- The script refuses any `DATABASE_URL` whose host isn't localhost. Never
  bypass that check or point `.env.local` at production.
- `ms_capture_sessions.owner_token` is intentionally not synced (it's a
  credential); local rows get fresh tokens.
- Use `--service <name>` (`npm run sync:prod -- --service <name>`) if the
  Railway service isn't named `ms` (in the shared project, `web` is iron's).
