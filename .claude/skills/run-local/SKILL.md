---
name: run-local
description: Boot the local database (if needed) and run the app against it. Use when asked to run, start, or preview the app locally.
---

Get the app running at http://localhost:4174 from whatever state things are in.

1. If `.env.local` is missing, copy it from `.env.local.example`.
2. Run `npm run migrate:local`. On a connection error, run `npm run db:up`
   (if Docker isn't available, stop and tell the user to start Docker Desktop
   or point `DATABASE_URL` at another local Postgres), then retry migrate a
   few times 2s apart.
3. `curl http://localhost:4174/healthz`:
   - `{"ok":true}`: already running; don't start a second instance.
   - Other response: something else owns the port; report it
     (`netstat -ano | grep :4174`), don't kill it.
   - Connection refused: free; continue.
4. If `web/dist` is missing, run `npm run build`. For UI work with hot reload
   use `npm run web:dev` instead (Vite proxies /api to :4174).
5. Start `npm run server:local` in the background and verify
   `/healthz` and `/api/sessions` respond.
6. Report the URL and how to stop it (find the PID on port 4174).

Use `server:local`, not `server`: only the former loads `.env.local`.
