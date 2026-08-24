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

const RARITY_WORD_DENOMINATOR = {
  always: 1,
  common: 8,
  uncommon: 32,
  rare: 128,
  "very rare": 512,
};

/** Wiki rarity values are either "Always", an exact fraction ("1/516"), or
 * (mostly for bulk resource drops) a bare tier word with no exact number
 * given anywhere on the page. Tier words get a representative denominator
 * rather than a fabricated precise one — same honesty tradeoff the wiki
 * itself makes by not giving an exact number there either. */
function parseRarity(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "always" || s === "100%") return { numerator: 1, denominator: 1 };
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/);
  if (frac) return { numerator: Number(frac[1]), denominator: Number(frac[2]) };
  if (s in RARITY_WORD_DENOMINATOR) return { numerator: 1, denominator: RARITY_WORD_DENOMINATOR[s] };
  return null;
}

function parseQuantity(raw) {
  if (!raw) return { min: 1, max: 1 };
  const range = raw.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (range) return { min: Number(range[1].replace(/,/g, "")), max: Number(range[2].replace(/,/g, "")) };
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) ? { min: n, max: n } : { min: 1, max: 1 };
}

/** Every {{DropsLine|...}} on the page, tagged with which section header
 * (===Section===) it fell under — "100%" sections map to guaranteed drops,
 * everything else is treated as an independent tertiary-style roll (this
 * project doesn't model a true single-roll-per-kill main table for
 * generated content; see generate-monsters.mjs's same simplification). */
function parseDropsLines(wikitext) {
  const lines = [];
  let currentSection = "";
  const sectionRe = /===\s*([^=]+?)\s*===/g;
  const dropsRe = /\{\{DropsLine\|([^}]*)\}\}/g;

  const sectionMarkers = [...wikitext.matchAll(sectionRe)].map((m) => ({ index: m.index, name: m[1] }));
  const sectionAt = (index) => {
    let name = "";
    for (const marker of sectionMarkers) {
      if (marker.index > index) break;
      name = marker.name;
    }
    return name;
  };

  for (const m of wikitext.matchAll(dropsRe)) {
    const params = Object.fromEntries(
      m[1].split("|").map((p) => {
        const eq = p.indexOf("=");
        return eq === -1 ? [p.trim(), ""] : [p.slice(0, eq).trim(), p.slice(eq + 1).trim()];
      }),
    );
    if (!params.name) continue;
    currentSection = sectionAt(m.index);
    lines.push({ name: params.name, quantity: params.quantity, rarity: params.rarity, noted: params.noted === "yes", section: currentSection });
  }
  return lines;
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
    // Multi-form bosses (pre/post-quest, phases) use combat1/combat2/... instead
    // of a plain `combat` field — combat1 is always the first-listed version.
    const combatRaw = infoboxField(wikitext, "Monster", "combat") ?? infoboxField(wikitext, "Monster", "combat1");
    const combatLevel = combatRaw ? Number(combatRaw.replace(/[^\d]/g, "")) : NaN;
    if (!Number.isFinite(combatLevel) || combatLevel <= 0) {
      skipped.push({ title, reason: `no valid combat level (${combatRaw})` });
      continue;
    }

    const dropsLines = parseDropsLines(wikitext);
    const rawEntries = [];
    for (const line of dropsLines) {
      const rarity = parseRarity(line.rarity);
      if (!rarity) continue; // couldn't parse — skip rather than fabricate a rate
      const { min, max } = parseQuantity(line.quantity);
      pendingItemNames.add(line.name);
      rawEntries.push({
        itemName: line.name,
        itemId: slugify(line.name),
        minQuantity: min,
        maxQuantity: max,
        numerator: rarity.numerator,
        denominator: rarity.denominator,
        ...(line.noted ? { noted: true } : {}),
        isGuaranteed: line.section === "100%" && rarity.denominator === 1,
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
    const tertiary = [];
    for (const raw of pending.rawEntries) {
      if (invalidItemNames.has(raw.itemName)) continue;
      const { itemName: _itemName, isGuaranteed, ...entry } = raw;
      (isGuaranteed ? always : tertiary).push(entry);
    }
    if (always.length === 0 && tertiary.length === 0) {
      skipped.push({ title: pending.name, reason: "no valid drops after item validation" });
      continue;
    }
    newMonsters.push({
      id: pending.id,
      name: pending.name,
      combatLevel: pending.combatLevel,
      iconUrl: pending.iconUrl,
      examine: pending.examine,
      category: "boss",
      unlockCost: unlockCostFor(pending.combatLevel),
      always,
      mainTable: [],
      tertiary,
    });
  }

  const mergedMonsters = [...monsters, ...newMonsters];
  const mergedItems = { ...items, ...newItems };

  writeFileSync(path.join(outDir, "monsters.json"), JSON.stringify(mergedMonsters, null, 2));
  writeFileSync(path.join(outDir, "items.json"), JSON.stringify(mergedItems, null, 2));

  console.log(`Added ${newMonsters.length} bosses and ${Object.keys(newItems).length} items.`);
  if (skipped.length > 0) {
    console.log("Skipped:");
    for (const s of skipped) console.log(`  ${s.title}: ${s.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
