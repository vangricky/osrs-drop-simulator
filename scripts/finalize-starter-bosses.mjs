#!/usr/bin/env node
/**
 * Decides which bosses are free to start with. Both generator scripts give
 * every boss a real unlock cost (no more "under combat level N" free tier —
 * that stopped making sense once every remaining monster is high-level boss
 * content); exactly the two lowest-combat-level bosses across the WHOLE
 * roster (hand-authored + both generated sources combined) get set back to
 * free, matching "give signed-in players two starting bosses." Guests don't
 * use this at all — they get every boss unlocked from the start (see
 * starterUnlockedIds/allNpcIds in src/hooks/useGameState.ts).
 *
 * Run last, after generate-monsters.mjs and generate-bosses-from-wiki.mjs.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const FREE_COUNT = 2;

function main() {
  const monstersPath = path.join(ROOT, "public/data/monsters.json");
  const monsters = JSON.parse(readFileSync(monstersPath, "utf8"));

  const npcDataPath = path.join(ROOT, "src/data/npcData.ts");
  const npcDataText = readFileSync(npcDataPath, "utf8");
  const handcrafted = [
    ...npcDataText.matchAll(/id: '([^']+)',\s*\n\s*unlockCost: (\d+),\s*\n\s*name: '[^']*',\s*\n\s*combatLevel: (\d+),/g),
  ].map((m) => ({ id: m[1], unlockCost: Number(m[2]), combatLevel: Number(m[3]) }));

  const all = [
    ...monsters.map((m) => ({ id: m.id, combatLevel: m.combatLevel, source: "generated" })),
    ...handcrafted.map((h) => ({ id: h.id, combatLevel: h.combatLevel, source: "handcrafted" })),
  ].sort((a, b) => a.combatLevel - b.combatLevel);

  const free = all.slice(0, FREE_COUNT);
  console.log("Free starter bosses:", free.map((f) => `${f.id} (cl ${f.combatLevel}, ${f.source})`));

  const freeGeneratedIds = new Set(free.filter((f) => f.source === "generated").map((f) => f.id));
  const freeHandcraftedIds = new Set(free.filter((f) => f.source === "handcrafted").map((f) => f.id));

  let changed = 0;
  for (const m of monsters) {
    const shouldBeFree = freeGeneratedIds.has(m.id);
    if (shouldBeFree && m.unlockCost !== 0) {
      m.unlockCost = 0;
      changed++;
    } else if (!shouldBeFree && m.unlockCost === 0) {
      // A previous run's free pick is no longer in the lowest N (roster
      // changed) — needs a real cost again. Shouldn't normally happen since
      // generator scripts always assign a real cost first, but stay correct
      // if this script is ever re-run without a full regeneration first.
      console.warn(`${m.id} was free but is no longer in the lowest ${FREE_COUNT} — leaving its cost as-is (0). Re-run the generators first.`);
    }
  }
  writeFileSync(monstersPath, JSON.stringify(monsters, null, 2));
  console.log(`Updated ${changed} generated monster(s).`);

  if (freeHandcraftedIds.size > 0) {
    console.warn(
      `A hand-authored boss (${[...freeHandcraftedIds].join(", ")}) is among the lowest ${FREE_COUNT} — ` +
        `update its unlockCost to 0 directly in src/data/npcData.ts (not automated, that file is hand-verified).`,
    );
  }
}

main();
