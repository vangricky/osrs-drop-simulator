#!/usr/bin/env node
/**
 * Generates public/data/monsters.json and items.json from:
 *  - osrsreboxed-db (community-maintained, cache-derived monster/drop database)
 *  - the OSRS Wiki's real-time prices API (item names/icons/live values)
 *
 * Re-run this after a game update to pick up new/changed monsters. For
 * day-to-day price freshness, use update-prices.mjs instead (much cheaper).
 *
 * Monsters/items already hand-authored in src/data/npcData.ts are skipped
 * here so this never clobbers verified data.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UA = "osrs-drop-simulator-fan-site (data build script)";

const MONSTERS_URL = "https://raw.githubusercontent.com/0xNeffarion/osrsreboxed-db/master/docs/monsters-complete.json";
const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const LATEST_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function img(name) {
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

function unlockCostFor(combatLevel, isBoss) {
  // Monsters under combat level 10 are the free starter tier; everything
  // from 10 up must be unlocked. Steep on purpose — this is meant to be a
  // long grind, not a quick unlock-everything session.
  if (combatLevel < 10) return 0;
  let raw = 400 * combatLevel ** 2.5 * (isBoss ? 40 : 1);
  // Round to ~2 significant figures for a "chunky" number.
  const magnitude = 10 ** Math.floor(Math.log10(raw) - 1);
  return Math.round(raw / magnitude) * magnitude;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log("Fetching monster database, item mapping, and live prices...");
  const [monstersRaw, mapping, latest] = await Promise.all([
    fetchJson(MONSTERS_URL),
    fetchJson(MAPPING_URL),
    fetchJson(LATEST_URL),
  ]);

  const mappingById = new Map(mapping.map((it) => [it.id, it]));
  const { npcIds: existingNpcIds, itemIds: existingItemIds } = existingHandcraftedIds();

  const allMonsters = Object.values(monstersRaw);
  const eligible = allMonsters.filter(
    (m) => !m.duplicate && m.combat_level > 0 && Array.isArray(m.drops) && m.drops.length > 0,
  );

  // Dedupe by slug, keeping the richest (most drops) entry per name.
  const bySlug = new Map();
  for (const m of eligible) {
    const slug = slugify(m.name);
    if (existingNpcIds.has(slug)) continue;
    const prev = bySlug.get(slug);
    if (!prev || m.drops.length > prev.drops.length) bySlug.set(slug, m);
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
    const isBoss = (m.category || []).includes("bosses");
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

    generatedMonsters.push({
      id: slug,
      name: m.name,
      combatLevel: m.combat_level,
      iconUrl: img(m.name),
      examine: m.examine || "",
      category: isBoss ? "boss" : m.combat_level >= 30 ? "mid" : "low",
      unlockCost: unlockCostFor(m.combat_level, isBoss),
      always,
      mainTable: [],
      tertiary,
    });
  }

  const generatedItems = {};
  for (const id of usedItemIds) {
    const mapped = mappingById.get(id);
    const name = canonicalNameById.get(id);
    const slug = slugify(name);
    if (existingItemIds.has(slug) || generatedItems[slug]) continue;

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
      };
    } else {
      // Not in the tradeable item mapping (pets, ensouled heads, some quest-bound drops).
      generatedItems[slug] = {
        id: slug,
        name,
        iconUrl: img(name),
        members: Boolean(membersById.get(id)),
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
