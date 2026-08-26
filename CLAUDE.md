# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fan-made OSRS (Old School RuneScape) drop-rate simulator, boss-only by design: pick a boss, roll its real drop
table, loot lands in a 28-slot inventory, sell for GP, unlock harder bosses. Deployed at
https://osrsdropsimulation.com/ via GitHub Pages. Not affiliated with Jagex (fan content policy).

## Commands

```bash
npm run dev                    # local dev server (vite)
npm run build                  # tsc -b && vite build — type errors fail the build
npm run lint                   # oxlint
npm run preview                # serve the production build locally

npm run generate-monsters      # regenerate the osrsreboxed-sourced boss/item dataset (public/data/*.json)
node scripts/generate-bosses-from-wiki.mjs   # add current bosses missing from osrsreboxed-db (run AFTER generate-monsters)
node scripts/finalize-starter-bosses.mjs     # pick the 2 free starter bosses (lowest combat level)
npm run update-prices          # refresh item GP values from the live GE price API
npm run export-reference-data  # regenerate supabase/reference-data.json + a timestamped seed migration
```

There is no test suite. Verification is: `npm run build` (typecheck) + `npm run lint`, and for
UI-affecting changes, an actual browser check — build, `vite preview --port <port> --strictPort`, and drive it
(Playwright or otherwise). The game's persisted state lives in `localStorage` under `osrs-drop-sim-state-v2`,
which is the fastest way to seed a specific inventory/GP state for manual testing without playing through it.

## Architecture

### Data pipeline: generated JSON + hand-authored TypeScript, merged at runtime

Monster and item data is NOT hand-maintained in one place. It's a pipeline:

1. `scripts/generate-monsters.mjs` builds `public/data/monsters.json` + `public/data/items.json` from
   osrsreboxed-db (a community DB frozen since ~2019).
2. `scripts/generate-bosses-from-wiki.mjs` scrapes the OSRS Wiki directly (`Category:Bosses`, live wikitext drop
   tables) to append every boss missing from osrsreboxed (Nex, DT2 bosses, etc. — anything post-2019), appending
   to the same two JSON files rather than replacing them.
3. `src/data/npcData.ts` hand-authors a small set of `handcraftedNpcs` / `handcraftedItems` / `containers`
   (openable things: clue caskets, chest keys) directly in TypeScript, plus `mergeNpcs()` / `mergeItems()` which
   combine the generated JSON with the handcrafted TS data (handcrafted wins on id collision).
4. `src/data/loadGameData.ts` fetches the generated JSON at runtime (kept out of the JS bundle — it's ~1.4MB) and
   calls the merge functions to produce the final `GameData` the app runs on. Fetches use a build-time
   cache-busting query param (`__DATA_BUILD_TIME__`, set in `vite.config.ts`) since the JSON is served from a
   fixed URL that CDNs/browsers would otherwise cache indefinitely across deploys.

**Any change to boss/item/container data goes through this pipeline, not ad hoc edits to the generated JSON.**
Hand-editing `public/data/*.json` will be silently overwritten by the next `generate-monsters`/`update-prices`
run. Hand-authored NPCs, items, and all openable containers live in `src/data/npcData.ts` directly.

`generate-monsters.mjs`'s current logic puts every non-guaranteed drop into `tertiary` and always emits
`mainTable: []` — but the currently-committed `public/data/monsters.json` has richly weighted `mainTable`
entries for every generated boss (confirmed by reading the script and the live data side by side). The script
and the shipped data have drifted apart at some point since the last full regeneration; running
`npm run generate-monsters` today would restructure every generated boss's table, not just refresh prices. Diff
the output carefully (or fix the drift first) before trusting a fresh run.

`scripts/lib/boss-classifier.mjs` is the shared library for wiki-scraping scripts: wikitext parsing
(`parseDropsLinesFromWikitext`, `parseWikiRarity`, `parseWikiQuantity`, `evalWikiExprTemplates` for MediaWiki
`{{#expr:...}}` arithmetic), and classification logic for what counts as a "real repeatable boss" vs. a raid room
/ quest-only encounter / alternate-mode section (`ALTERNATE_MODE_SECTIONS`, e.g. Yama's Contract, Mimic rewards)
that can't be honestly represented as a normal per-kill/per-open drop table.

One-off wiki data-build scripts used to seed a specific set of items (e.g. a past clue-casket rebuild) are
deleted after use once their output is merged into `npcData.ts` — they aren't meant to be re-run. Reusable
pipeline scripts (`generate-bosses-from-wiki.mjs`, `update-prices.mjs`, etc.) stay.

### Drop resolution model (`src/utils/dropLogic.ts`)

Every `LootTable` (an `Npc` kill or a `ContainerDef` open) has three independent parts, mirroring the real game:

- `always`: guaranteed every roll.
- `mainTable`: exactly ONE weighted pick per roll (never "nothing"), repeated `mainRolls` times (default 1).
  Weights are each entry's own `numerator/denominator`, normalized against the table's own total rather than
  assumed to sum to 1.
- `tertiary`: independent rolls (clue scrolls, pets, rare uniques) that can stack with each other and with a
  main-table hit.

This is the single mechanic driving both boss kills and container opens (clue caskets, keys) — there is no
separate reward-resolution logic for containers.

An item being droppable and having its own entry in `containers` (keyed by item id) are two independent facts
— nothing cross-checks them. A key/casket item can exist and be dropped by a boss with no matching
`containers[itemId]`, and the UI just silently treats it as a normal non-openable item (no error, no visual
difference beyond the missing "click to open" badge). When adding a new lootable key/casket, verify both sides
exist, not just the item definition.

### State: local-first, with a validated cloud layer

`src/hooks/useGameState.ts` is the core game state (inventory, GP, kill counts, collection log, unlocks,
prestige). Guests are local-only (`localStorage`). Signed-in players (`src/hooks/useAuth.ts`, Supabase Auth) get
the same state synced from Postgres on load, and every GP-affecting action calls a Supabase RPC
(`record_kill`, `open_container`, `sell_item`, `sell_all_items`, `unlock_npc`, `prestige`) in addition to the
optimistic local update — those RPCs are the actual source of truth for a signed-in player's GP, re-validated
server-side against `npc_reference` / `item_reference` / `container_reference` so a client can't just edit its
own save to an arbitrary number. The 28-slot inventory *arrangement* (not its GP-relevant contents) is synced
separately via `sync_inventory_cache`/`sync_collection_log_firsts` as a trusted, unvalidated display cache —
faking that locally has no effect on the leaderboard, which only reads `gp`.

Guests get every boss unlocked immediately (no account, no stakes). Signed-in players start with only
`unlockCost === 0` bosses and grind GP for the rest, same rule as everything else.

`supabase/reference-data.json` (and the seed migration it's exported into) is generated by
`scripts/export-reference-data.mjs`, which transpiles `npcData.ts` with esbuild and runs the exact same
`mergeNpcs`/`mergeItems` the browser uses — it's derived, never a hand-maintained second copy. Regenerate it
after any data pipeline change that affects unlock costs, item values, or container contents, then
`supabase db push` (or run the generated migration SQL) to apply. See `supabase/README.md` for full backend
setup (one-time SQL migrations, custom SMTP via Resend, OAuth providers) — accounts/leaderboard are fully
optional; the app runs guest-only with no Supabase project configured (`src/lib/supabase.ts` exports
`supabaseEnabled`).

### SEO: `public/faq/` is a second, non-React static page

`index.html`'s `<body>` is just `<div id="root">` — the whole game is client-rendered, so a crawler that
doesn't execute JS sees no content there. `public/faq/index.html` exists specifically to have *something*
genuinely static and indexable: it's hand-written HTML with its own inline `<style>` (matching the game's
palette by hand, not by referencing the Vite build's hashed CSS output) and its own `<meta>`/CSP/JSON-LD
(`FAQPage` structured data). It is deliberately **not** wired into the React app or the Vite build — treat it
as its own small static site living inside `public/`, linked from the in-game hamburger menu as a plain
`<a href="/faq/">`, not a client-side route.

### Deploy

Static build → GitHub Pages via `.github/workflows/deploy.yml` on every push to `main` (modern
`upload-pages-artifact`/`deploy-pages` actions, not the legacy Jekyll branch flow). Requires
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` as repo secrets (all client-safe —
never the Supabase `service_role` key). `.github/workflows/update-prices.yml` runs daily, refreshes
`public/data/items.json` from live GE prices, and commits directly to `main` if values changed, which triggers
the deploy workflow automatically.
