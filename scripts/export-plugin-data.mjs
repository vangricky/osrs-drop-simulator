#!/usr/bin/env node
/**
 * Exports the game data the RuneLite plugin (vangricky/osrs-drop-simulator-plugin)
 * bundles: every boss, item and container exactly as the browser merges them
 * (same transpile-npcData.ts approach as export-reference-data.mjs), plus each
 * item's numeric OSRS item id so the plugin can draw real item sprites with
 * RuneLite's ItemManager.
 *
 * Ids: tradeables come from the OSRS Wiki prices mapping (by exact name, the
 * same match update-prices.mjs uses); anything left (pets, clue scrolls,
 * untradeables) is looked up one by one in the wiki's infobox_item bucket.
 * Results are cached in scripts/plugin-item-ids.json so re-runs only query
 * new items.
 *
 * Usage: node scripts/export-plugin-data.mjs [outfile]
 *   default outfile: ../osrs-drop-simulator-plugin/src/main/resources/com/osrsdropsim/drop-sim-data.json
 */
import { build } from "esbuild";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE = path.join(__dirname, "plugin-item-ids.json");
const OUT =
  process.argv[2] ??
  path.resolve(ROOT, "../osrs-drop-simulator-plugin/src/main/resources/com/osrsdropsim/drop-sim-data.json");
const UA = "osrs-drop-simulator-fan-site (plugin data export)";

async function transpile(entry, name) {
  const outfile = path.join(mkdtempSync(path.join(tmpdir(), `${name}-`)), `${name}.cjs`);
  await build({ entryPoints: [path.join(ROOT, entry)], bundle: true, platform: "node", format: "cjs", outfile });
  return import(`file://${outfile}`);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function wikiItemId(name) {
  const q = `bucket('infobox_item').select('item_id','item_name').where('item_name','${name.replace(/'/g, "\\'")}').run()`;
  const data = await fetchJson(`https://oldschool.runescape.wiki/api.php?action=bucket&format=json&query=${encodeURIComponent(q)}`);
  for (const row of data.bucket ?? []) {
    for (const id of row.item_id ?? []) {
      if (/^\d+$/.test(id)) return Number(id);
    }
  }
  return null;
}

const loot = (t) => ({
  always: t.always ?? [],
  mainTable: t.mainTable ?? [],
  mainRolls: t.mainRolls ?? 1,
  tertiary: t.tertiary ?? [],
  tertiaryGroups: t.tertiaryGroups ?? [],
});

async function main() {
  const { mergeNpcs, mergeItems, containers } = await transpile("src/data/npcData.ts", "npcData");
  const { PET_ITEM_IDS } = await transpile("src/data/pets.ts", "pets");
  const npcs = mergeNpcs(JSON.parse(readFileSync(path.join(ROOT, "public/data/monsters.json"), "utf8")));
  const items = mergeItems(JSON.parse(readFileSync(path.join(ROOT, "public/data/items.json"), "utf8")));

  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
  const mapping = await fetchJson("https://prices.runescape.wiki/api/v1/osrs/mapping");
  const idByName = new Map(mapping.map((it) => [it.name.toLowerCase(), it.id]));

  const missing = [];
  for (const it of Object.values(items)) {
    if (cache[it.id] !== undefined) continue;
    const id = idByName.get(it.name.toLowerCase());
    if (id != null) cache[it.id] = id;
    else missing.push(it);
  }

  console.log(`${missing.length} items need a wiki lookup...`);
  let i = 0;
  for (const it of missing) {
    try {
      cache[it.id] = await wikiItemId(it.name);
    } catch (e) {
      console.warn(`  lookup failed for ${it.name}: ${e.message}`);
      continue; // not cached, so the next run retries it
    }
    if (++i % 25 === 0) console.log(`  ${i}/${missing.length}`);
    await new Promise((r) => setTimeout(r, 120)); // be polite to the wiki
  }
  writeFileSync(CACHE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 1));

  const out = {
    generatedAt: new Date().toISOString(),
    npcs: npcs.map((n) => ({
      id: n.id,
      name: n.name,
      combatLevel: n.combatLevel,
      unlockCost: n.unlockCost,
      examine: n.examine,
      ...loot(n),
    })),
    items: Object.fromEntries(
      Object.values(items).map((it) => [
        it.id,
        {
          name: it.name,
          value: it.value,
          tradeable: it.tradeable,
          stackable: it.stackable,
          pet: PET_ITEM_IDS.has(it.id),
          osrsId: cache[it.id] ?? -1,
        },
      ]),
    ),
    containers: Object.fromEntries(Object.values(containers).map((c) => [c.itemId, { name: c.name, ...loot(c) }])),
  };
  writeFileSync(OUT, JSON.stringify(out));
  const unmapped = Object.values(out.items).filter((it) => it.osrsId < 0).map((it) => it.name);
  console.log(`Wrote ${OUT}`);
  console.log(`${out.npcs.length} npcs, ${Object.keys(out.items).length} items (${unmapped.length} without an OSRS id), ${Object.keys(out.containers).length} containers.`);
  if (unmapped.length) console.log(`Unmapped (shown as name tiles in the plugin): ${unmapped.slice(0, 30).join(", ")}${unmapped.length > 30 ? ", ..." : ""}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
