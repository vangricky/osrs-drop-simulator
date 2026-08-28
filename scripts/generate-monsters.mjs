#!/usr/bin/env node
/**
 * Generates public/data/monsters.json and items.json from:
 *  - osrsreboxed-db (community-maintained, cache-derived monster/drop database)
 *  - the OSRS Wiki's real-time prices API (item names/icons/live values)
 *
 * Boss-only simulator: every candidate is cross-checked against the OSRS
 * Wiki's Category:Bosses (osrsreboxed's own "bosses" tag is stale/loose —
 * confirmed it includes plain Slayer monsters and one-off quest fights that
 * happen to share a name with unrelated content) and filtered through
 * scripts/lib/boss-classifier.mjs's raid-room/one-off-quest exclusions.
 *
 * Re-run this after a game update to pick up new/changed bosses. For
 * day-to-day price freshness, use update-prices.mjs instead (much cheaper).
 * Run generate-bosses-from-wiki.mjs after this — osrsreboxed has had no new
 * content since ~2019, so anything released since then (most current
 * bosses) only comes from that script.
 *
 * Monsters/items already hand-authored in src/data/npcData.ts are skipped
 * here so this never clobbers verified data.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  normalizeName,
  fetchWikiBossNames,
  batchFetchWikitext,
  isQuestOnlyVariant,
  isRealRepeatableBoss,
} from "./lib/boss-classifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UA = "osrs-drop-simulator-fan-site (data build script)";

const MONSTERS_URL = "https://raw.githubusercontent.com/0xNeffarion/osrsreboxed-db/master/docs/monsters-complete.json";
const ITEMS_URL = "https://raw.githubusercontent.com/0xNeffarion/osrsreboxed-db/master/docs/items-complete.json";
const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const LATEST_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Guessing "https://.../images/<Name>.png" from a monster/item name gets it
// wrong for a real minority of entries (redirects to a shared tiered-item
// page, disambiguation pages, name drift from the price API's canonical
// name, etc). Rather than re-deriving these live on every run (slow, and a
// couple of resolutions need a manual disambiguation call a script can't
// make — e.g. picking which combat-level variant of "Mummy" to use), this
// is a checked-in table of verified corrections, built from a one-time
// audit that HEAD-checked every generated icon URL against the live wiki.
// Re-run that audit (see icon-overrides.json's sibling script in git
// history / ask Claude to redo it) if new broken icons show up after a
// game update.
const ICON_OVERRIDES = JSON.parse(readFileSync(path.join(__dirname, "icon-overrides.json"), "utf8"));

function img(name) {
  if (ICON_OVERRIDES[name]) return ICON_OVERRIDES[name];
  return `https://oldschool.runescape.wiki/images/${name.replace(/ /g, "_")}.png`;
}

function parseQuantity(q) {
  if (typeof q === "number") return { min: q, max: q };
  const m = String(q).match(/(\d+)\s*-\s*(\d+)/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = Number.parseInt(q, 10);
  return { min: Number.isFinite(n) ? n : 1, max: Number.isFinite(n) ? n : 1 };
}

function existingHandcraftedIds() {
  const text = readFileSync(path.join(ROOT, "src/data/npcData.ts"), "utf8");
  const npcIds = new Set([...text.matchAll(/^    id: '([^']+)',/gm)].map((m) => m[1]));
  const itemIds = new Set(
    [...text.matchAll(/^\s*\[\s*"([^"]+)"\s*,/gm)].map((m) => m[1]),
  );
  return { npcIds, itemIds };
}

// Every remaining monster is a boss now, so this always applies the boss
// multiplier — no more "under combat level N is free" tier, since every
// boss here is well above any such threshold anyway. Which two bosses are
// actually free (lowest combat level) is decided once, globally, across
// every source (hand-authored + both generator scripts' output) by
// scripts/finalize-starter-bosses.mjs, run last in the pipeline.
//
// This is only a rough placeholder for a BRAND NEW boss the pipeline hasn't
// seen before — it deliberately undershoots rather than overshoots (an
// earlier ~10,000x-larger version of this formula produced a multi-billion
// unlock cost for the very first paid boss, when free starter bosses earn a
// few hundred gp/kill — effectively unplayable). The actual source of truth
// is scripts/calibrate-unlock-costs.mjs, which derives cost from the boss's
// real drop-table value instead of combat level alone; run it with --write
// after any pipeline run that adds a new boss, and it'll override this.
function unlockCostFor(combatLevel) {
  let raw = 1.6 * combatLevel ** 2.5;
  // Round to ~2 significant figures for a "chunky" number.
  const magnitude = 10 ** Math.floor(Math.log10(raw) - 1);
  return Math.round(raw / magnitude) * magnitude;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/** True per-item stackability (cache-derived), keyed by item name. Name-based
 * pattern matching (the old approach) misses plenty of real stackable items
 * — e.g. "Feather" doesn't end in any of the suffixes a regex would guess. */
function buildStackableByName(itemsRaw) {
  const byName = new Map();
  for (const it of Object.values(itemsRaw)) {
    if (!byName.has(it.name)) byName.set(it.name, Boolean(it.stackable));
  }
  return byName;
}

/** osrsreboxed-db has ~1,200 exact-duplicate drop rows across ~80 monsters
 * (confirmed by inspection — e.g. Mugger's own source entry lists "Bones"
 * twice). Not our bug, but we still need to not ship it. */
function dedupeDrops(drops) {
  const seen = new Set();
  const out = [];
  for (const d of drops) {
    const key = `${d.id}|${d.quantity}|${d.rarity}|${d.rolls}|${d.noted}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function entryKey(e) {
  return `${e.itemId}|${e.minQuantity}|${e.maxQuantity}|${e.numerator}|${e.denominator}|${Boolean(e.noted)}`;
}

/** A handful of monsters have two raw rows for the same item with slightly
 * different rarity (e.g. 0.1640625 vs 0.171875) that both round to the same
 * denominator once converted to an effective probability — invisible to the
 * raw-level dedupe above but still a real double-roll of the same drop.
 * `exclude` additionally strips entries already guaranteed elsewhere (e.g. a
 * near-100% tertiary roll for an item that's already an `always` drop). */
function dedupeEntries(entries, exclude = new Set()) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = entryKey(e);
    if (seen.has(key) || exclude.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

async function main() {
  console.log("Fetching monster database, item database, item mapping, live prices, and the wiki's boss list...");
  const [monstersRaw, itemsRaw, mapping, latest, wikiBossNames] = await Promise.all([
    fetchJson(MONSTERS_URL),
    fetchJson(ITEMS_URL),
    fetchJson(MAPPING_URL),
    fetchJson(LATEST_URL),
    fetchWikiBossNames(),
  ]);
  const wikiBossSet = new Set(wikiBossNames.map(normalizeName));

  const mappingById = new Map(mapping.map((it) => [it.id, it]));
  const stackableByName = buildStackableByName(itemsRaw);
  const { npcIds: existingNpcIds, itemIds: existingItemIds } = existingHandcraftedIds();

  const allMonsters = Object.values(monstersRaw);
  const eligible = allMonsters.filter(
    (m) =>
      !m.duplicate &&
      m.combat_level > 0 &&
      Array.isArray(m.drops) &&
      m.drops.length > 0 &&
      wikiBossSet.has(normalizeName(m.name)) &&
      isRealRepeatableBoss(m.name),
  );

  // Dedupe by slug, keeping the richest (most drops) entry per name. Drop
  // rows are deduped first so a monster padded with duplicate rows doesn't
  // get wrongly favored as the "richest" version. Ties keep the FIRST entry
  // (source data lists ids ascending, and the "normal"/live variant always
  // has a lower id than any "unused" sibling — see the unused-NPC check
  // just below, which relies on that ordering).
  const bySlug = new Map();
  for (const m of eligible) {
    const slug = slugify(m.name);
    if (existingNpcIds.has(slug)) continue;
    m.drops = dedupeDrops(m.drops);
    const prev = bySlug.get(slug);
    if (!prev || m.drops.length > prev.drops.length) bySlug.set(slug, m);
  }

  // A few source entries are leftover/never-actually-encounterable NPCs
  // (e.g. "Golem" combat level 55, wiki-flagged "Golem (unused NPC)" — no
  // live spawn exists). Not a real drop source, so it doesn't belong in a
  // simulator of actual game mechanics. Siblings that tie on drop count
  // with a "normal" (non-unused) version are unaffected, since the normal
  // version's lower id already wins the tie above.
  for (const [slug, m] of [...bySlug]) {
    if (/unused/i.test(m.wiki_url || "")) bySlug.delete(slug);
  }

  // isRealRepeatableBoss/RAID_ROOM_BOSSES catches known cases, but a wiki
  // "boss" name match can still be the specific one-off quest-encounter
  // page for something with a separate real repeatable version elsewhere —
  // same check generate-bosses-from-wiki.mjs does, applied here too since
  // osrsreboxed's data can independently include that exact quest NPC.
  console.log(`Verifying ${bySlug.size} boss-matched candidates aren't one-off quest encounters...`);
  const candidateWikitext = await batchFetchWikitext([...bySlug.values()].map((m) => m.name));
  for (const [slug, m] of [...bySlug]) {
    const wikitext = candidateWikitext[m.name];
    if (wikitext && isQuestOnlyVariant(wikitext)) bySlug.delete(slug);
  }

  // The monster DB's drop name and the price-mapping's canonical name can differ for the
  // same item id (e.g. "Cannonball" vs "Steel cannonball"). Resolve ONE canonical name per
  // id up front so the monster's itemId reference and the item dictionary key always agree.
  const canonicalNameById = new Map();
  const membersById = new Map();
  for (const m of bySlug.values()) {
    for (const d of m.drops) {
      if (!d.id || !d.name) continue;
      if (!canonicalNameById.has(d.id)) {
        canonicalNameById.set(d.id, mappingById.get(d.id)?.name ?? d.name);
        membersById.set(d.id, d.members);
      }
    }
  }

  const generatedMonsters = [];
  const usedItemIds = new Set();

  for (const [slug, m] of bySlug) {
    const always = [];
    const tertiary = [];

    for (const d of m.drops) {
      if (!d.id || !d.name) continue;
      usedItemIds.add(d.id);
      const itemSlug = slugify(canonicalNameById.get(d.id));
      const { min, max } = parseQuantity(d.quantity);

      if (d.rarity >= 1) {
        always.push({ itemId: itemSlug, minQuantity: min, maxQuantity: max, numerator: 1, denominator: 1, ...(d.noted ? { noted: true } : {}) });
      } else {
        const rolls = d.rolls && d.rolls > 0 ? d.rolls : 1;
        const effectiveP = 1 - (1 - d.rarity) ** rolls;
        if (effectiveP <= 0) continue;
        const denominator = Math.max(1, Math.round(1 / effectiveP));
        tertiary.push({ itemId: itemSlug, minQuantity: min, maxQuantity: max, numerator: 1, denominator, ...(d.noted ? { noted: true } : {}) });
      }
    }

    if (always.length === 0 && tertiary.length === 0) continue;

    const dedupedAlways = dedupeEntries(always);
    const alwaysKeys = new Set(dedupedAlways.map(entryKey));

    generatedMonsters.push({
      id: slug,
      name: m.name,
      combatLevel: m.combat_level,
      iconUrl: img(m.name),
      examine: m.examine || "",
      category: "boss",
      unlockCost: unlockCostFor(m.combat_level),
      always: dedupedAlways,
      mainTable: [],
      tertiary: dedupeEntries(tertiary, alwaysKeys),
    });
  }

  const generatedItems = {};
  for (const id of usedItemIds) {
    const mapped = mappingById.get(id);
    const name = canonicalNameById.get(id);
    const slug = slugify(name);
    if (existingItemIds.has(slug) || generatedItems[slug]) continue;

    // Noted items always stack as a matter of game mechanics regardless of
    // the base item's own stackability, same override dropLogic.ts applies.
    const stackable = stackableByName.get(name) ?? false;

    if (mapped) {
      const price = latest.data[String(id)];
      const value = price
        ? Math.round(((price.high ?? price.low ?? 0) + (price.low ?? price.high ?? 0)) / 2)
        : (mapped.value ?? 0);
      generatedItems[slug] = {
        id: slug,
        name,
        iconUrl: img(mapped.icon.replace(/\.png$/i, "")),
        members: Boolean(mapped.members),
        value,
        tradeable: true,
        stackable,
      };
    } else {
      // Not in the tradeable item mapping (pets, ensouled heads, some quest-bound drops).
      generatedItems[slug] = {
        id: slug,
        name,
        iconUrl: img(name),
        members: Boolean(membersById.get(id)),
        stackable,
        value: 0,
        tradeable: false,
      };
    }
  }

  const outDir = path.join(ROOT, "public/data");
  writeFileSync(path.join(outDir, "monsters.json"), JSON.stringify(generatedMonsters, null, 2));
  writeFileSync(path.join(outDir, "items.json"), JSON.stringify(generatedItems, null, 2));

  console.log(`Generated ${generatedMonsters.length} monsters and ${Object.keys(generatedItems).length} items.`);
  console.log(`Skipped (already hand-authored): ${existingNpcIds.size} monsters, ${existingItemIds.size} items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
