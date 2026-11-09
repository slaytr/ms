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
  **Drafts:** `draft-map-glyphs.ts` holds hand-drawn candidates (not measured) for every letter and digit the map
  font still lacks (J M O P Q V W X Y Z, j k q v x z, 0 2-9, and `-` `:`), in the style of the real glyphs. A harvested glyph
  always wins, so labelling a real frame replaces its draft; a wrong draft just never matches. `draft-map-glyphs.test.ts`
  rejects any draft within 2px of another character (that is why there is no `.` or `!`) and checks each reads with one
  wrong pixel. Same mechanism as `draft-glyphs.ts` for the name/job font.
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

## Missed frames (training data from production)
- When the detector can't read a piece of data (`lib/miss-capture.ts`: character name, level digits,
  EXP, meso digits, minimap, map name), `useMissReporter` sends a full-resolution PNG to
  `POST /api/miss-frames` (table `ms_miss_frames`, migration 005). A level inferred from EXP counts as a
  miss, since its digits still weren't read. Only once the game was recognised in the run (never frames from
  some other shared window), a few per run, spaced apart, once per kind of miss per browser per day.
- The endpoint is anonymous (it must work before any session exists), so it is bounded hard: PNG header
  checked against the stated size, 8 MB cap, per-client and overall hourly caps, 3 frames per signature
  (fields + level + map + window size), 100 frames total (oldest dropped). Frames are never served over HTTP.
- No foreign key to sessions, so `sync:prod` (truncate cascade) can't wipe them.
- Pull them with `npm run pull:misses` (via `railway ssh`, like sync:prod): saves
  `fixtures/other_<w>x<h>_<ms>.png` plus `fixtures/misses.json` (what was missing and what was read). Label
  the frame in `labels.json` and run `harvest-templates.mjs`. `--purge` deletes pulled frames from prod.
- The home page tells players that an unreadable frame is kept. Screenshots can show other players' names
  (chat, nameplates): they come from the window the player chose to share.

## Pot tracker (Use tab)
- `lib/detect/inventory.ts` reads the Item Inventory's **Use** tab, found from the same `MESOS` anchor as meso
  (window position doesn't matter). Slot (0,0) is at the anchor + (-164,-222), pitch 36 across / 34 down, 5 cols x 6
  visible rows. The tab is "selected" when its head pixel is pink (pale or deeper). Native-size windows only.
- **Icons**: matched against `inventory-templates.json` icons (opaque pixels, searched a few px around bottom-centre,
  pixels under the stack count ignored). A match needs a small colour difference AND a clear margin over the
  runner-up, else the slot is "an item we don't track" (null id). Icons come from `fixtures/potion-icons/` (gitignored;
  fetched from ms-classic.com, whose robots.txt allows it).
- **Stack counts** are drawn over the icon in a proportional font (white fill, black outline). Only white runs bordered by
  black on both sides count (icon highlights aren't). Digits are matched left to right by exact shape with a 2px
  tolerance and a margin over the next digit; ink after the count that isn't digit-shaped is ignored, ink that is
  digit-shaped but unmatched makes the count null. **A count is right or null, never guessed.** A `1` that loses its
  flag to compression (seen on the selected slot) reads null on purpose: a bare stem looks like a `0`'s left edge.
- Templates are generated: label frames with `useTab` in `labels.json` (6 rows x 5 cells, "Item name:count",
  "?:count" for untracked items, "-" empty), then `node scripts/harvest-inventory.mjs` (lists missing digits).
- **Quick slots (preferred source)**: `lib/detect/quickslots.ts` reads the 2 x 4 hotkey bar. A hotkeyed item shows its
  TOTAL across every stack and page (a frame's Use tab showed Blue Potion 500, the bar 502: two stacks were off
  screen), and the bar is always on screen, so no inventory window and no scrolling. It hangs off the **EXP label**
  (slot (0,0) at +218,-107; columns 0/35/71/106 across, 34 down), so it is found at any window width (checked at
  1026, 1282 and 1368). Icons match the same templates (key name over the top 11 rows ignored, looser threshold, bigger
  margin). Counts are the same font but shaded differently on a white background over bright icons, so they have their
  own digit set (`quickDigits`), learned from `quickSlots` labels (2 rows x 4 cells; "?" = icon with no count, e.g. a
  skill) with the Use-tab digits seeding where each digit sits. Never a wrong count: 0 wrong, 0 unreadable / 31
  tracked slots on 23 real frames. The harvest retries skipped slots in passes (a rendering learned from one slot, e.g.
  a `7` over the orange icon, unlocks others; a learned shape only has to sit 3+ px from every other digit, since the
  label already says which digit it is). It also learns `quickTails`: the harmless icon highlights left right after
  the last digit of a labelled count, which the strict reader then ignores when seen again (an unfamiliar remnant
  still makes the count null).
  **Only Blue Potion, Orange Potion and Pure Water have ever been seen on the bar.** Simulation (the real digit
  renderings lifted off those icons and laid over all 24 catalog icons): every item was FOUND (240/240, 0 wrong
  items), but only ~25% of counts read and ~75% came back unreadable, because each icon's highlights add their own
  noise to the digits. So a newly hotkeyed item is found at once but its count needs a labelled frame or two
  (`quickSlots` in labels.json, then harvest) before it reads; until then it falls back to the Use tab. The quick-slot
  reader uses `strictTail` (gives up when a half-hidden last digit follows, rather than returning "50" for "502");
  that rule costs real Use-tab reads, so the Use tab does not use it.
- `lib/pot-tracker.ts`: an item on the quick slots is counted from there, as the sum of FALLS between good readings (a
  rise = bought/looted is ignored, so restocking never distorts it; a fall of more than `MAX_USE_PER_READING` = 25 in
  one ~3s reading is a misread or a bulk sale, not drinking, so it isn't counted); the Use tab is then ignored for that item and
  what it had counted is banked. Items not on the bar fall back to the Use tab (first complete scan = baseline, net fall
  since, scans at another scrollbar position not compared). Items are independent: an unreadable count leaves out only
  that item. **Repot** pauses counting (banks use, ignores both sources) and resume starts from fresh readings. Cost and
  HP/MP come from `data/potions.ts` (24 items, from ms-classic.com; shop prices are community-recorded, items no NPC
  sells have no cost, percentage potions have no HP/MP amount). Shown in `PotStats.vue` (overview and pop-out); a green
  "QS" pill beside the name marks pots counted from the quick slots.
- **Limits**: Use-tab pots count only the visible slots (the tab scrolls); neither source can tell a pot drunk from one
  traded or dropped; pots not on the quick slots still need the Use tab open.

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
