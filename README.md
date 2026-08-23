# OSRS Drop Simulator

[![Deploy to GitHub Pages](https://github.com/vangricky/osrs-drop-simulator/actions/workflows/deploy.yml/badge.svg)](https://github.com/vangricky/osrs-drop-simulator/actions/workflows/deploy.yml)

**[Play it live →](https://vangricky.github.io/osrs-drop-simulator/)**

A fan-made drop rate simulator for *Old School RuneScape*. Kill monsters, roll their real drop tables, sell your loot, and grind your way from a level-1 chicken up to the richest bosses in the game — all without leaving your browser. Not affiliated with or endorsed by Jagex.

## What is this?

OSRS players are obsessive about drop rates — "how many Zulrah kills until I get my tanzanite fang," that kind of thing. This site lets you simulate that grind directly: pick a monster, roll its actual drop table (real rates, real items), and watch what you get. No waiting, no game client, just the dopamine of the roll.

It's grown into a small idle/incremental game on top of that core simulator:

- **346 monsters** and **935 items**, with drop rates and values sourced from real OSRS data (not guessed)
- **A GP economy** — sell what you loot, spend GP to unlock harder monsters
- **Progression that actually grinds** — starter monsters are free, but top-tier bosses cost *billions* of GP to unlock
- **Openable containers** — clue scroll caskets and chest keys you loot can be opened for their own reward rolls
- **Accounts + a global leaderboard** — sign in and your GP total is ranked against everyone else who's played

## How to play

1. **Pick a monster** from the browser on the left. You start with five: Chicken, Cow, Giant rat, Goblin, and Man.
2. **Hit "Simulate Drop"** to roll its drop table. Coins go straight to your GP balance; items land in your 28-slot inventory.
3. **Sell what you don't need** — click the `$` badge on an item, or use "Sell all" to liquidate your whole inventory at once.
4. **Unlock new monsters** with GP once you can afford them. Costs scale steeply — a Guard is a few thousand GP, a mid-tier dragon is tens of millions, and a boss like Zulrah runs into the billions. This is meant to take a while.
5. **Open anything you loot that's "openable"** (clue scroll caskets, Brimstone/Larran's keys) — look for the 🎁 badge on an inventory slot. These roll their own separate reward table, including some of the rarest, highest-value items in the game.
6. **Sign in** (top right) to save your progress to the cloud instead of just this browser, and get a spot on the leaderboard.

## Climbing the leaderboard

The leaderboard ranks players by GP. A few things that actually move the needle:

- **Unlock efficiently.** A monster's loot value roughly tracks its unlock cost, but not perfectly — some monsters are much better GP-per-kill for their price than others. Cheap wins add up.
- **Never let loot sit unsold.** Idle inventory is idle GP.
- **Always open your clue caskets and keys.** The jackpot items in elite clue rewards are worth *hundreds of millions* — one lucky casket can out-earn hours of grinding.
- **The grind is intentional.** Getting to the top isn't a five-minute job — the highest-tier bosses are priced to take real, sustained play. That's the point.

## What's under the hood

| Layer | What it does |
|---|---|
| **Frontend** | React + TypeScript + Vite + Tailwind, styled after OSRS's own UI (parchment, bevels, the works) |
| **Drop data** | Generated from [osrsreboxed-db](https://github.com/0xNeffarion/osrsreboxed-db) (a community database built from the game's own cache), cross-referenced against the [OSRS Wiki's live price API](https://prices.runescape.wiki) for item names, icons, and values |
| **Accounts & leaderboard** | Supabase (Postgres + Auth). Every GP-affecting action goes through server-side functions that validate the change against reference data — a signed-in save can't just be edited to an arbitrary number. This was verified by live penetration testing, not just written and assumed safe (see `supabase/migrations/0004_security_hardening.sql` for what that testing found and fixed) |
| **Hosting** | Static build on GitHub Pages, deployed automatically via GitHub Actions on every push to `main` |
| **Price freshness** | A daily scheduled job re-fetches live Grand Exchange prices and commits any changes, which triggers an automatic redeploy |

### Scripts

```bash
npm run dev                    # local dev server
npm run build                  # production build
npm run generate-monsters      # regenerate the monster/item dataset (after a game update)
npm run update-prices          # refresh item GP values from live prices
npm run export-reference-data  # regenerate the server-side validation data (supabase/)
```

Setting up your own Supabase backend for accounts/leaderboard? See `supabase/README.md`.

## Disclaimer

Created using intellectual property belonging to Jagex Limited under the terms of [Jagex's Fan Content Policy](https://legal.jagex.com/docs/policies/fan-content-policy). This content is not endorsed by or affiliated with Jagex.
