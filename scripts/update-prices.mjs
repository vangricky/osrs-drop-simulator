#!/usr/bin/env node
/**
 * Lightweight daily refresh: updates the `value` field of every tradeable
 * item in public/data/items.json using the OSRS Wiki's live GE
 * prices. Cheap and fast — safe to run on a schedule (e.g. a daily GitHub
 * Actions cron). Does NOT touch monster data or hand-authored items in
 * npcData.ts; re-run generate-monsters.mjs for that (only needed after a
 * game update, not daily).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ITEMS_PATH = path.resolve(__dirname, "../public/data/items.json");
const UA = "osrs-drop-simulator-fan-site (daily price refresh)";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  console.log("Fetching live prices and item mapping...");
  const [mapping, latest] = await Promise.all([
    fetchJson("https://prices.runescape.wiki/api/v1/osrs/mapping"),
    fetchJson("https://prices.runescape.wiki/api/v1/osrs/latest"),
  ]);

  const idByName = new Map(mapping.map((it) => [it.name, it.id]));
  const items = JSON.parse(readFileSync(ITEMS_PATH, "utf8"));

  let updated = 0;
  for (const item of Object.values(items)) {
    if (!item.tradeable) continue;
    const id = idByName.get(item.name);
    if (id == null) continue;
    const price = latest.data[String(id)];
    if (!price) continue;
    const value = Math.round(((price.high ?? price.low ?? 0) + (price.low ?? price.high ?? 0)) / 2);
    if (value > 0 && value !== item.value) {
      item.value = value;
      updated++;
    }
  }

  writeFileSync(ITEMS_PATH, JSON.stringify(items, null, 2));
  console.log(`Updated prices for ${updated} of ${Object.keys(items).length} items.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
