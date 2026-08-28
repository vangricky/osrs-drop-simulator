// Recomputes every boss's unlockCost from actual drop-table data, instead of
// combat level alone. Run this after adding a new boss (generate-bosses-
// from-wiki.mjs / npcData.ts) so its unlock price lands in the same curve as
// everything else, rather than shipping with generateMonstersFromWiki's
// placeholder combat-level formula.
//
// Usage:
//   node scripts/calibrate-unlock-costs.mjs          # print OLD vs NEW, don't write
//   node scripts/calibrate-unlock-costs.mjs --write   # apply NEW to monsters.json + npcData.ts
//
// Methodology: for each boss, estimate a "practical" gp/kill — expected
// value across always + mainTable + tertiary + tertiaryGroups, but excluding
// (a) anything rarer than RARITY_FLOOR and (b) any per-unit item value above
// VALUE_CAP. This deliberately ignores one-in-a-lifetime jackpot uniques
// (Twisted bow, etc.) that would otherwise dominate a pure expected-value
// calculation and make it useless for pacing — a player's *typical*
// kill-to-kill income is what unlock costs should scale against, not the
// mathematical mean including a 1/72 megadrop.
//
// Bosses are sorted by combat level and walked in order, tracking the best
// practical gp/kill seen so far. Each boss's unlock cost is that running
// best times KILLS_PER_TIER, rounded to the nearest 1,000 — i.e. "grinding
// your best current boss for ~KILLS_PER_TIER kills affords the next tier."
// Free (unlockCost === 0) starter bosses are left untouched.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

const outdir = mkdtempSync(path.join(tmpdir(), "calibrate-"));
await build({
  entryPoints: [path.join(ROOT, "src/data/npcData.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(outdir, "npcData.cjs"),
});
const { mergeNpcs, mergeItems } = await import(`file://${path.join(outdir, "npcData.cjs")}`);

const monstersPath = path.join(ROOT, "public/data/monsters.json");
const itemsPath = path.join(ROOT, "public/data/items.json");
const npcDataPath = path.join(ROOT, "src/data/npcData.ts");

const monsters = JSON.parse(readFileSync(monstersPath, "utf8"));
const rawItems = JSON.parse(readFileSync(itemsPath, "utf8"));
const npcs = mergeNpcs(monsters);
const items = mergeItems(rawItems);

const RARITY_FLOOR = 1 / 300;
const VALUE_CAP = 3_000_000;
// Chosen so the first paid boss (Barrows chest, unlocked with only Brutus /
// Obor's practical gp/kill available) lands around 3M gp, per direct user
// feedback that an earlier 500-kill-per-tier pass (~194K for Barrows) felt
// too cheap.
const KILLS_PER_TIER = 7732;

function itemValue(itemId) {
  if (itemId === "coins") return 1;
  const it = items[itemId];
  return it && it.tradeable ? it.value : 0;
}
function practicalValue(itemId) {
  const v = itemValue(itemId);
  return v > VALUE_CAP ? 0 : v;
}
function avgQty(e) {
  return (e.minQuantity + e.maxQuantity) / 2;
}

function practicalGpPerKill(npc) {
  let gp = 0;
  for (const e of npc.always) gp += avgQty(e) * practicalValue(e.itemId);
  const total = npc.mainTable.reduce((s, e) => s + e.numerator / e.denominator, 0);
  if (total > 0) {
    const rolls = npc.mainRolls ?? 1;
    let mainExpected = 0;
    for (const e of npc.mainTable) {
      const weight = e.numerator / e.denominator / total;
      mainExpected += weight * avgQty(e) * practicalValue(e.itemId);
    }
    gp += mainExpected * rolls;
  }
  for (const e of npc.tertiary) {
    const p = e.numerator / e.denominator;
    if (p < RARITY_FLOOR) continue;
    gp += p * avgQty(e) * practicalValue(e.itemId);
  }
  for (const group of npc.tertiaryGroups ?? []) {
    const p = group.numerator / group.denominator;
    if (p < RARITY_FLOOR) continue;
    const completeP =
      group.completeNumerator && group.completeDenominator ? group.completeNumerator / group.completeDenominator : 0;
    for (const item of group.items) {
      const shareIfSingle = (1 - completeP) / group.items.length;
      const perItemP = p * (completeP + shareIfSingle);
      gp += perItemP * avgQty(item) * practicalValue(item.itemId);
    }
  }
  return gp;
}

const sorted = npcs
  .map((npc) => ({ id: npc.id, name: npc.name, combatLevel: npc.combatLevel, oldCost: npc.unlockCost, gpPerKill: practicalGpPerKill(npc) }))
  .sort((a, b) => a.combatLevel - b.combatLevel);

let runningBest = 0;
const out = [];
for (const r of sorted) {
  const newCost = r.oldCost === 0 ? 0 : Math.max(Math.round((runningBest * KILLS_PER_TIER) / 1000) * 1000, 5000);
  out.push({ ...r, newCost });
  runningBest = Math.max(runningBest, r.gpPerKill);
}

for (const r of out) {
  console.log(
    `${r.combatLevel.toString().padStart(5)}  practicalGp/kill=${Math.round(r.gpPerKill).toLocaleString().padStart(11)}  OLD=${r.oldCost.toLocaleString().padStart(16)}  NEW=${r.newCost.toLocaleString().padStart(14)}  ${r.name}`,
  );
}
const totalOld = out.reduce((s, r) => s + r.oldCost, 0);
const totalNew = out.reduce((s, r) => s + r.newCost, 0);
console.log(`\nTotal to unlock everything: OLD=${totalOld.toLocaleString()} NEW=${totalNew.toLocaleString()}`);

if (!WRITE) {
  console.log("\n(dry run — pass --write to apply)");
  process.exit(0);
}

const newCostById = new Map(out.map((r) => [r.id, r.newCost]));

let monstersChanged = 0;
for (const m of monsters) {
  const newCost = newCostById.get(m.id);
  if (newCost !== undefined && m.unlockCost !== newCost) {
    m.unlockCost = newCost;
    monstersChanged++;
  }
}
writeFileSync(monstersPath, JSON.stringify(monsters, null, 2) + "\n");

let npcDataSrc = readFileSync(npcDataPath, "utf8");
let npcDataChanged = 0;
// Handcrafted npcs: rewrite each `id: 'x', ... unlockCost: N,` pair in place,
// scoped per-id so this can't cross-match on a repeated cost value.
for (const [id, newCost] of newCostById) {
  const re = new RegExp(`(id:\\s*'${id}'[\\s\\S]{0,400}?unlockCost:\\s*)\\d+`);
  if (re.test(npcDataSrc)) {
    npcDataSrc = npcDataSrc.replace(re, (_m, prefix) => `${prefix}${newCost}`);
    npcDataChanged++;
  }
}
writeFileSync(npcDataPath, npcDataSrc);

console.log(`\nWrote ${monstersChanged} change(s) to monsters.json, ${npcDataChanged} change(s) to npcData.ts.`);
console.log("Re-run `npm run export-reference-data` and push the resulting Supabase migration to sync unlock costs server-side.");
