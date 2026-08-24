#!/usr/bin/env node
/**
 * Adds bosses missing from the osrsreboxed-db source (generate-monsters.mjs's
 * data source, which has had no new content added since ~2019 — confirmed by
 * checking: Nex, Vorkath, Alchemical Hydra, Sarachnis, Scurrius, Duke
 * Sucellus, The Leviathan, Vardorvis, The Whisperer, Phantom Muspah, and
 * every DT2/2023+ boss are all completely absent from it). The OSRS Wiki's
 * Category:Bosses is community-maintained and current, so this scrapes drop
 * tables directly from each boss page's wikitext instead.
 *
 * Run AFTER generate-monsters.mjs — reads and appends to its output files
 * (public/data/monsters.json, public/data/items.json) rather than
 * regenerating them, so it composes with the existing pipeline instead of
 * replacing it.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  fetchWikiBossNames,
  batchFetchWikitext,
  isQuestOnlyVariant,
  isRealRepeatableBoss,
  parseWikiRarity,
  parseWikiQuantity,
  parseDropsLinesFromWikitext,
  shouldKeepAlwaysEntry,
} from "./lib/boss-classifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UA = "osrs-drop-simulator-fan-site (data build script)";
const MAPPING_URL = "https://prices.runescape.wiki/api/v1/osrs/mapping";
const LATEST_URL = "https://prices.runescape.wiki/api/v1/osrs/latest";

const ICON_OVERRIDES = JSON.parse(readFileSync(path.join(__dirname, "icon-overrides.json"), "utf8"));

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function img(name) {
  if (ICON_OVERRIDES[name]) return ICON_OVERRIDES[name];
  return `https://oldschool.runescape.wiki/images/${name.replace(/ /g, "_")}.png`;
}

// Which bosses are actually free (lowest combat level) is decided once,
// globally, across every source by scripts/finalize-starter-bosses.mjs, run
// last in the pipeline — every boss here just gets the full formula cost.
function unlockCostFor(combatLevel) {
  let raw = 400 * combatLevel ** 2.5 * 40;
  const magnitude = 10 ** Math.floor(Math.log10(raw) - 1);
  return Math.round(raw / magnitude) * magnitude;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

function infoboxField(wikitext, infoboxName, field) {
  const start = wikitext.indexOf(`{{Infobox ${infoboxName}`);
  if (start === -1) return null;
  // Infobox blocks in practice don't nest other {{ }} templates directly in
  // their own field lines (citations/links live in the surrounding prose),
  // so the first "\n}}" after the opening reliably closes it.
  const end = wikitext.indexOf("\n}}", start);
  const block = end === -1 ? wikitext.slice(start) : wikitext.slice(start, end);
  const re = new RegExp(`\\n\\|\\s*${field}\\s*=\\s*([^\\n]*)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}


async function main() {
  const outDir = path.join(ROOT, "public/data");
  const monsters = JSON.parse(readFileSync(path.join(outDir, "monsters.json"), "utf8"));
  const items = JSON.parse(readFileSync(path.join(outDir, "items.json"), "utf8"));

  const npcDataText = readFileSync(path.join(ROOT, "src/data/npcData.ts"), "utf8");
  const handcraftedNpcIds = new Set([...npcDataText.matchAll(/^    id: '([^']+)',/gm)].map((m) => m[1]));
  const handcraftedItemIds = new Set([...npcDataText.matchAll(/^\s*\[\s*"([^"]+)"\s*,/gm)].map((m) => m[1]));

  const existingNpcIds = new Set([...handcraftedNpcIds, ...monsters.map((m) => m.id)]);
  const existingItemBySlug = new Map(Object.entries(items));
  const existingItemNames = new Map(Object.values(items).map((it) => [it.name, it.id]));
  for (const id of handcraftedItemIds) existingItemBySlug.set(id, true);

  console.log("Fetching Category:Bosses member list...");
  const allTitles = await fetchWikiBossNames();
  let candidateTitles = allTitles.filter((t) => !existingNpcIds.has(slugify(t)));
  // TEST_LIMIT=8 / TEST_TITLES="Nex,Yama" node scripts/generate-bosses-from-wiki.mjs
  // — for spot-checking parsing changes against a small sample before a full run.
  if (process.env.TEST_LIMIT) candidateTitles = candidateTitles.slice(0, Number(process.env.TEST_LIMIT));
  if (process.env.TEST_TITLES) candidateTitles = process.env.TEST_TITLES.split(",");
  console.log(`${allTitles.length} boss pages on the wiki, ${candidateTitles.length} not already covered.`);

  console.log("Fetching wikitext for candidate boss pages...");
  const wikitextByTitle = await batchFetchWikitext(candidateTitles);

  const [mapping, latest] = await Promise.all([fetchJson(MAPPING_URL), fetchJson(LATEST_URL)]);
  const mappingByName = new Map(mapping.map((it) => [it.name, it]));

  // Pass 1: parse each candidate's drop lines but don't commit to a final
  // monster entry yet — some referenced "item" names turn out not to be
  // real items at all (the wiki's own DropsLine convention includes rows
  // like `name=Nothing` for an explicit empty-roll placeholder, plus
  // disambiguation/NPC/meta-news pages that happen to share a name with
  // what looks like an item). Those get filtered out in pass 2, after
  // resolving every name against a real Infobox Item.
  const pendingMonsters = [];
  const pendingItemNames = new Set();
  const skipped = [];

  for (const title of candidateTitles) {
    if (!isRealRepeatableBoss(title)) {
      skipped.push({ title, reason: "raid room boss or known one-off quest encounter" });
      continue;
    }
    const wikitext = wikitextByTitle[title];
    if (!wikitext) {
      skipped.push({ title, reason: "no wikitext (redirect/missing)" });
      continue;
    }
    if (isQuestOnlyVariant(wikitext)) {
      skipped.push({ title, reason: "one-time quest encounter (a separate repeatable version exists elsewhere)" });
      continue;
    }
    // Multi-form bosses (pre/post-quest, phases) use combat1/combat2/...
    // instead of a plain `combat` field. Usually combat1 is the version to
    // use, but a few (Kraken: "Whirlpool" form1 is a non-combat inactive
    // state with combat1=N/A, the real "Kraken" form2=291) have an inactive
    // first form — so try each field in order and take the first one that's
    // actually a number rather than assuming position 1 is always right.
    const combatCandidates = ["combat", "combat1", "combat2", "combat3", "combat4"]
      .map((f) => infoboxField(wikitext, "Monster", f))
      .filter(Boolean);
    const combatRaw = combatCandidates.find((raw) => Number.isFinite(Number(raw.replace(/[^\d]/g, ""))) && Number(raw.replace(/[^\d]/g, "")) > 0);
    const combatLevel = combatRaw ? Number(combatRaw.replace(/[^\d]/g, "")) : NaN;
    if (!Number.isFinite(combatLevel) || combatLevel <= 0) {
      skipped.push({ title, reason: `no valid combat level (${combatRaw})` });
      continue;
    }

    const dropsLines = parseDropsLinesFromWikitext(wikitext);
    const rawEntries = [];
    for (const line of dropsLines) {
      const rarity = parseWikiRarity(line.rarity);
      if (!rarity) continue; // couldn't parse — skip rather than fabricate a rate
      if (rarity.denominator === 1 && !shouldKeepAlwaysEntry(line.raritynotes)) continue;
      const { min, max, noted } = parseWikiQuantity(line.quantity);
      pendingItemNames.add(line.name);
      rawEntries.push({
        itemName: line.name,
        itemId: slugify(line.name),
        minQuantity: min,
        maxQuantity: max,
        numerator: rarity.numerator,
        denominator: rarity.denominator,
        ...(line.noted || noted ? { noted: true } : {}),
        isGuaranteed: line.section === "100%" && rarity.denominator === 1,
        // The wiki's own "Tertiary" section is the only one that means
        // "independent bonus roll" (pets, clue scrolls) — every other named
        // section (Weapons and armour, Runes, Resources, Other, Unique...)
        // is really one combined main drop table, just split across
        // subsections for readability. Rolled as a single weighted pick
        // (see dropLogic.ts's rollDrop) so a kill is always guaranteed
        // something from it, same as the real game.
        isTertiary: line.section.trim().toLowerCase() === "tertiary",
        rolls: line.rolls ?? 1,
      });
    }
    if (rawEntries.length === 0) {
      skipped.push({ title, reason: "no parseable drops" });
      continue;
    }

    pendingMonsters.push({
      id: slugify(title),
      name: title,
      combatLevel,
      iconUrl: img(title),
      examine: infoboxField(wikitext, "Monster", "examine") ?? "",
      rawEntries,
    });
  }

  console.log(`Parsed ${pendingMonsters.length} candidate bosses (pre item-validation). Skipped ${skipped.length}.`);

  // Resolve every newly-referenced item not already in the catalog, and
  // validate each one is a genuine item (in the tradeable price mapping, OR
  // its own page has a real Infobox Item) rather than trusting DropsLine's
  // name blindly.
  const namesToResolve = [...pendingItemNames].filter((name) => !existingItemNames.has(name) && !existingItemBySlug.has(slugify(name)));
  console.log(`Resolving ${namesToResolve.length} new item names...`);
  const itemWikitext = await batchFetchWikitext(namesToResolve);

  const newItems = {};
  const invalidItemNames = new Set();
  for (const name of namesToResolve) {
    const slug = slugify(name);
    if (newItems[slug]) continue;
    const wikitext = itemWikitext[name];
    const mapped = mappingByName.get(name);
    const hasItemInfobox = wikitext ? wikitext.includes("{{Infobox Item") : false;
    if (!mapped && !hasItemInfobox) {
      invalidItemNames.add(name);
      continue;
    }

    const stackableRaw = wikitext ? infoboxField(wikitext, "Item", "stackable") : null;
    const tradeableRaw = wikitext ? infoboxField(wikitext, "Item", "tradeable") : null;
    const membersRaw = wikitext ? infoboxField(wikitext, "Item", "members") : null;
    const stackable = stackableRaw?.toLowerCase() === "yes";

    if (mapped) {
      const price = latest.data[String(mapped.id)];
      const value = price ? Math.round(((price.high ?? price.low ?? 0) + (price.low ?? price.high ?? 0)) / 2) : (mapped.value ?? 0);
      newItems[slug] = {
        id: slug,
        name,
        iconUrl: img(mapped.icon.replace(/\.png$/i, "")),
        members: Boolean(mapped.members),
        value,
        tradeable: true,
        stackable,
      };
    } else {
      newItems[slug] = {
        id: slug,
        name,
        iconUrl: img(name),
        members: membersRaw ? membersRaw.toLowerCase() === "yes" : true,
        stackable,
        value: 0,
        tradeable: tradeableRaw ? tradeableRaw.toLowerCase() === "yes" : false,
      };
    }
  }

  if (invalidItemNames.size > 0) {
    console.log(`Discarded ${invalidItemNames.size} DropsLine entries that weren't real items:`, [...invalidItemNames].join(", "));
  }

  // Pass 2: drop any raw entry referencing a name that turned out invalid,
  // then drop any monster left with no valid drops at all.
  const newMonsters = [];
  for (const pending of pendingMonsters) {
    const always = [];
    const mainTable = [];
    const tertiary = [];
    let mainRolls = 1;
    for (const raw of pending.rawEntries) {
      if (invalidItemNames.has(raw.itemName)) continue;
      const { itemName: _itemName, isGuaranteed, isTertiary, rolls, ...entry } = raw;
      if (isGuaranteed) {
        always.push(entry);
      } else if (isTertiary) {
        tertiary.push(entry);
      } else {
        mainTable.push(entry);
        if (rolls > mainRolls) mainRolls = rolls;
      }
    }
    if (always.length === 0 && mainTable.length === 0 && tertiary.length === 0) {
      skipped.push({ title: pending.name, reason: "no valid drops after item validation" });
      continue;
    }
    // Refreshing an already-generated boss (REFRESH_EXISTING mode) keeps its
    // already-decided unlockCost (which may have been zeroed out by
    // finalize-starter-bosses.mjs) instead of recomputing from the formula.
    const existing = monsters.find((m) => m.id === pending.id);
    newMonsters.push({
      id: pending.id,
      name: pending.name,
      combatLevel: pending.combatLevel,
      iconUrl: pending.iconUrl,
      examine: pending.examine,
      category: "boss",
      unlockCost: existing ? existing.unlockCost : unlockCostFor(pending.combatLevel),
      always,
      mainTable,
      ...(mainRolls > 1 ? { mainRolls } : {}),
      tertiary,
    });
  }

  // Upsert by id — a refreshed boss replaces its old entry in place (keeping
  // roster order stable) instead of being appended as a duplicate.
  const newMonstersById = new Map(newMonsters.map((m) => [m.id, m]));
  const mergedMonsters = [
    ...monsters.map((m) => newMonstersById.get(m.id) ?? m),
    ...newMonsters.filter((m) => !monsters.some((existing2) => existing2.id === m.id)),
  ];
  const mergedItems = { ...items, ...newItems };

  writeFileSync(path.join(outDir, "monsters.json"), JSON.stringify(mergedMonsters, null, 2));
  writeFileSync(path.join(outDir, "items.json"), JSON.stringify(mergedItems, null, 2));

  console.log(`Added/refreshed ${newMonsters.length} bosses and ${Object.keys(newItems).length} items.`);
  if (skipped.length > 0) {
    console.log("Skipped:");
    for (const s of skipped) console.log(`  ${s.title}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
