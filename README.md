# OSRS Drop Simulator

[![Deploy to GitHub Pages](https://github.com/vangricky/osrs-drop-simulator/actions/workflows/deploy.yml/badge.svg)](https://github.com/vangricky/osrs-drop-simulator/actions/workflows/deploy.yml)

**[Play it live →](https://osrsdropsimulation.com/)**

A fan-made drop rate simulator for *Old School RuneScape*, boss-only by design. Kill bosses, roll their real drop tables, sell your loot, and grind your way up to the richest endgame content in the game, all without leaving your browser. Not affiliated with or endorsed by Jagex.

## What is this?

OSRS players are obsessive about drop rates: "how many Zulrah kills until I get my tanzanite fang," that kind of thing. This site lets you simulate that grind directly: pick a boss, roll its actual drop table (real rates, real items), and watch what you get. No waiting, no game client, just the dopamine of the roll.

It's grown into a small idle/incremental game on top of that core simulator:

- **65 bosses** and 700+ items, with drop rates and values sourced from real OSRS data (not guessed). Boss-only by design, no filler monsters that just drop bones
- **A GP economy**: sell what you loot, spend GP to unlock harder bosses
- **Progression that actually grinds**: guests get every boss unlocked to just mess around; signed-in accounts start with two and grind GP for the rest, with top-tier bosses costing *billions*
- **Openable containers**: clue scroll caskets and chest keys you loot can be opened for their own reward rolls
- **Accounts + a global leaderboard**: sign in and your GP total (and separately, prestige count) is ranked against everyone else who's played
- **Prestige**: unlock every boss and reset for a permanent, ever-increasing prestige count with its own leaderboard tab

## How to play

1. **Pick a boss** from the browser on the left. Playing as a guest, everything's unlocked from the start, no grinding required. Sign in and you'll start with two, then unlock the rest with GP.
2. **Hit "Simulate Drop"** to roll its drop table. Coins go straight to your GP balance; items land in your 28-slot inventory.
3. **Sell what you don't need**: click the `$` badge on an item, or use "Sell all" to liquidate your whole inventory at once.
4. **Unlock new bosses** with GP once you can afford them. Costs scale steeply, from tens of millions for the lowest-level bosses up to hundreds of billions for the true endgame. This is meant to take a while.
5. **Open anything you loot that's "openable"** (clue scroll caskets, Brimstone/Larran's keys): look for the 🎁 badge on an inventory slot. These roll their own separate reward table, including some of the rarest, highest-value items in the game.
6. **Sign in** (top right) to save your progress to the cloud instead of just this browser, and get a spot on the leaderboard.

## Climbing the leaderboard

The leaderboard ranks players by GP (a separate tab ranks by prestige count). A few things that actually move the needle:

- **Unlock efficiently.** A boss's loot value roughly tracks its unlock cost, but not perfectly: some bosses are much better GP-per-kill for their price than others. Cheap wins add up.
- **Never let loot sit unsold.** Idle inventory is idle GP.
- **Always open your clue caskets and keys.** The jackpot items in elite clue rewards are worth *hundreds of millions*. One lucky casket can out-earn hours of grinding.
- **The grind is intentional.** Getting to the top isn't a five-minute job. The highest-tier bosses are priced to take real, sustained play. That's the point.

## What's under the hood

| Layer | What it does |
|---|---|
| **Frontend** | React + TypeScript + Vite + Tailwind, styled after OSRS's own UI (parchment, bevels, the works) |
| **Drop data** | Bosses cross-checked against the OSRS Wiki's own Category:Bosses (the authoritative "is this really a boss" list) and scraped directly from each page's drop table wikitext, since [osrsreboxed-db](https://github.com/0xNeffarion/osrsreboxed-db) (the older community database this project also pulls from) has had no new content since ~2019. Item names, icons, and live values come from the [OSRS Wiki's price API](https://prices.runescape.wiki) |
| **Accounts & leaderboard** | Supabase (Postgres + Auth). Every GP-affecting action goes through server-side functions that validate the change against reference data, so a signed-in save can't just be edited to an arbitrary number. This was verified by live penetration testing, not just written and assumed safe (see `supabase/migrations/0004_security_hardening.sql` for what that testing found and fixed) |
| **Hosting** | Static build on GitHub Pages, deployed automatically via GitHub Actions on every push to `main` |
| **Price freshness** | A daily scheduled job re-fetches live Grand Exchange prices and commits any changes, which triggers an automatic redeploy |

### Scripts

```bash
npm run dev                    # local dev server
npm run build                  # production build
npm run generate-monsters      # regenerate the osrsreboxed-sourced boss/item dataset
node scripts/generate-bosses-from-wiki.mjs   # add current bosses missing from osrsreboxed
node scripts/finalize-starter-bosses.mjs     # pick the 2 free starter bosses (lowest combat level)
npm run update-prices          # refresh item GP values from live prices
npm run export-reference-data  # regenerate the server-side validation data (supabase/)
```

Setting up your own Supabase backend for accounts/leaderboard? See `supabase/README.md`.

## Disclaimer

Created using intellectual property belonging to Jagex Limited under the terms of [Jagex's Fan Content Policy](https://legal.jagex.com/docs/policies/fan-content-policy). This content is not endorsed by or affiliated with Jagex.
