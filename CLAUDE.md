# maple-metrics

MapleStory metrics tracker in the style of meso.watch / mapleclassictracker.app.
**MapleStory Classic client only.** The user shares their game window via the
browser's `getDisplayMedia`; every few seconds we grab a full native-resolution
frame and read meso / EXP% / level with a purpose-built pixel detector
(web/src/lib/detect/, no OCR library), then post readings to the API. Rates
(meso/hr, EXP%/hr) are computed from reading deltas. Sibling project: `../iron`
(same stack and conventions).

## Detection (web/src/lib/detect/)
The Classic UI uses exact pixel fonts, so we match pixels instead of OCR:
- Each reading is located by a tiny **anchor** (the `EXP.`, `LV.` and `MESOS`
  labels), then digits are read at fixed offsets (layout.ts). The inventory is
  movable, so meso is found by anchor wherever it sits. Window width and aspect ratio don't matter
  (4:3, 16:9 and short windows all draw the UI at the same pixel size); window **height** does, see below.
- **Scaled windows.** The client draws its UI at a fixed 1366x768 and scales it to the window by
  height with a plain bilinear upscale (so a 1080p or 1440p window has every glyph smeared). `view.ts`
  undoes that: it fits the layout (windowed = 31px title bar + 1px borders, or borderless; native width
  rounded by the client) by checking which candidate makes the `EXP.`/`LV.` anchors match, then solves
  the upscale back to the exact native bitmaps (a tridiagonal least squares per axis), so the same
  templates and near-exact tolerances apply. `detectFrame` tries the frame as is first, and only fits
  when the status bar isn't found; the fit (~30ms) is cached in `DetectState.view`, a failed fit is not
  retried for a few ticks. Unscaling costs ~65ms/tick at 1440p. Sampling instead of solving (nearest or
  bilinear) was tried and blurs glyphs too much to match. Limits: the title bar/border sizes in
  `WINDOW_FRAMES` (Windows display scaling above 100% changes them), and client heights under 768 aren't
  scaled at all. `ANCHOR_HOME` (layout.ts) is checked against a real frame by a test.
- Digits are segmented at empty columns and matched to exact bitmap templates
  (templates.json). Unknown glyph => null reading. **Never guess a digit.**
- Meso is read right-to-left and stops at a verified blank gap, so another window
  overlapping the field doesn't corrupt it (see MESO in layout.ts).
- **Map name** comes from the minimap title in the top left, found by its `MINI MAP` anchor (so it
  works wherever the panel sits). Two lines: street ("Victoria Road") above map ("Tree Dungeon, ...").
  Own bold font (`fonts.map`), read only as far as the panel's flat background goes (`MAP` in layout.ts).
  The session is named `Street: Map` (`lib/map-label.ts`): a label typed on /testing wins, else the
  first readable map names it, renaming a session already created (`POST /api/sessions/:id/label`).
  A map with a letter that has no template yet reads null and the session stays unnamed; label that
  map's fixture (`street`/`map` in labels.json) and harvest to add it. In labels, `{ab}` = touching
  letters (one glyph), `~h~` = one letter drawn as two pieces (stem + arch; "h" and "b" do this).
- Pure TS with no browser APIs, so it runs in the page, Vitest and Node scripts.
  Scripts import the .ts directly (Node type stripping): use `.ts` import extensions.
- Templates are generated, not hand-written: add screenshots via the dev
  "Capture fixtures" panel, label them in `fixtures/labels.json`, then run
  `node scripts/harvest-templates.mjs`. It reports which characters still have
  no template and flags conflicting labels (it caught a comma mislabelled as a period).
  `node scripts/probe-glyphs.mjs` shows how any screen region segments.
- **Drafted letters.** The only exception to "generated": `detect/draft-glyphs.ts` holds hand-drawn
  guesses (2 variants each) for text-font letters and digits not harvested yet, so a name or job with
  an unharvested letter can still read. Not measured from the game. `default-templates.ts` merges them
  under the harvested set, so harvesting a real frame replaces a draft automatically. Matching allows
  1 wrong pixel, so the test requires every draft to be 3+ px from any other letter's template (a
  wrong letter is worse than none). `Y`/`y` are cut from the real `yY` glyph. If a drafted letter
  never matches in practice, harvest a real frame of it; don't tweak the draft.
- Tests run the detector over every real frame in `fixtures/`. Label a frame from a taller window
  `"scaled": true`: tests read it, harvest skips it (templates are learned from native-size frames).
  `scale-fixture.ts` renders a native frame the way a taller window shows it, for layouts and content
  (an open inventory) no real capture covers.

## Pages and identity
- `/` is the real UI: a MapleStory-themed home page (Lilita One + Nunito; own art, no game assets).
  One CTA shares the game window, then a checklist confirms game window / character / level / EXP
  (meso is optional, it only shows with the inventory open).
- `/testing` (not linked from the UI; `/capture` redirects here) is the developer test bench (manual session labels, raw readings, fixture capture).
- Both use `composables/useTracker.ts` (share + detect + upload). Sessions are created lazily, on the
  first real reading, so a share that never shows the game leaves no empty row.
- **No auth.** The player is identified from the screen: `character.fingerprint` (hash of the name
  pixels) is the identity, the readable name/job are a nicety. The profile
  (`lib/profile.ts`) lives in localStorage; a name we can't read yet is typed in by the player.
- The text font draws capital I and lowercase l identically; `resolveLookalikes` decides by position.
- `web/src/data/expTable.ts` is the Classic EXP table; level-ups use it for exact EXP gained.

## Pop-out tracker
- `components/PipTracker.vue` is the overlay: time to level, progress bar, EXP/h, meso/h, meso gained.
  `usePopOut` opens it in Chrome/Edge's Document Picture-in-Picture window (always on top) and falls
  back to a plain popup elsewhere. The overlay is `<Teleport>`ed into that window, so one Vue app and
  one set of state drive both; stylesheets are copied across when it opens.
- Time to level = (EXP table need for the level - current EXP) / EXP per hour (\`lib/level-eta.ts\`,
  \`lib/tracker-view.ts\`). It uses the session average, so it moves as the rate moves, and carries over
  a level-up. Until 2 minutes of play it says "Calculating" and per-hour figures show a dash, because a
  rate from one kill is meaningless.
- \`/testing\` shows the same overlay inline for testing without a game window.
- **Untested risk:** when the tracker tab is hidden behind the game, Chrome may throttle its timers
  and stop updating video frames. If readings stall while the pop-out is open, the fix is to pull frames
  with MediaStreamTrackProcessor and drive the tick from a Worker timer.

## What gets persisted
- `ms_readings`: one row per ~3s capture (batched ~30s). Measured at **187 bytes/row** with indexes
  (89 MB heap + 89 MB index per million rows). Fine for in-session graphs, but it dominates storage.
- `ms_session_snapshots`: a `start` and an `end` row per session (level, EXP, %, meso, name, job,
  fingerprint). Tiny. This is the source for graphs across sessions; group by `fingerprint`.
  The end snapshot carries the last known value forward (meso is only visible with the inventory open).
  A tab closed without Stop sends no end snapshot; the last `ms_readings` row is the fallback.
- Per-hour figures display as whole numbers under 1000, else truncated `numK` (`lib/format.ts`).

## Stack
Fastify 5 + `pg` (api/, plain ESM `.mjs`), Vue 3 + Vite + TS (web/), Postgres 18,
Railway for prod: service `ms` in the shared `runescape` project (iron owns `web`), same Postgres, deployed with `railway up --service ms`. Tests: Vitest.

## Commands
- `npm run db:up` / `db:down`: local Postgres (docker, port 5434)
- `npm run migrate:local`, `npm run server:local` (http://localhost:4174)
- `npm run web:dev`: Vite dev server (proxies /api to 4174)
- `npm run sync:prod`: mirror prod DB into local (skill: `sync-prod`)
- `npm test`, `npm run typecheck`

## Conventions
- API envelope: `{ success, data, error }`.
- **Shared database:** we live in the same Postgres as `../iron`. EVERY table,
  index, sequence and constraint we create must be prefixed `ms_`, including the
  migration tracker (`ms_schema_migrations`). Never touch unprefixed objects;
  `truncate`/`drop` only ever name explicit `ms_` tables.
- Schema changes: add a new `api/migrations/NNN_name.sql`; never edit applied ones.
- Prod access is only via `railway ssh` (private network). Never put prod
  credentials in `.env.local`; `sync-from-prod.mjs` refuses non-localhost targets.
- `ms_capture_sessions.owner_token` is a credential: never sync, log, or return it
  except on session creation.
- Pure logic (detection, rate math) lives in `web/src/lib/` with tests.
- Immutable updates; small files; no `console.log` in app code.

## Skills (.claude/skills)
`sync-prod`, `migrate-prod`, `run-local`.
