---
name: migrate-prod
description: Apply pending database migrations directly to the production database. Use when the user wants a migration applied before the next deploy.
---

Normally unnecessary: `api/server.mjs` runs `runMigrations()` at boot, so a
deploy applies new migrations itself. Use this to apply one ahead of a deploy.

1. `railway whoami` must succeed; otherwise tell the user to `! railway login`.
2. `railway status` must show the `production` environment and the `web`
   service. If it shows anything else, stop and report what it's linked to.
3. Run `railway ssh --service web -- node api/migrate.mjs` and show the output
   verbatim.
4. On failure, report the error as-is. Don't retry or widen scope.

Migrations are tracked in `ms_schema_migrations`, so re-running is safe. Never
edit an already-applied migration file; add a new numbered one.
