#!/usr/bin/env node
/**
 * Rebuilds every regular boss's drop table from the OSRS Wiki so the
 * simulator matches the real game, including bosses that were generated
 * long ago (osrsreboxed data, frozen ~2019) or hand-authored in npcData.ts.
 *
 * Why: an audit against the wiki found most older tables were missing many
 * items (rare/gem drop table rolls, resources, seeds, sigils...). Because a
 * main table is ONE weighted pick normalised to its own total (dropLogic.ts),
 * missing items didn't just disappear: they made everything left over more
 * common (e.g. Zulrah's uniques were ~2.8x too common).
 *
 * Two wiki sources are combined:
 *  - the `dropsline` bucket: every drop with its exact per-roll rate and
 *    quantity, with the rare/gem drop tables already expanded into items;
 *  - the page wikitext (parseDropsLinesFromWikitext): which section a drop
 *    is in (only "Tertiary" means an independent roll) and whether it's noted.
 * Any per-roll probability the wiki leaves unaccounted for becomes an
 * explicit "nothing" entry, so normalisation can't inflate other drops.
 *
 * Kept as-is: each boss's id, name, combat level, unlock cost, icon and its
 * tertiaryGroups (Sarachnis pages, Skotizo totems, DT2 clue split).
 * Not touched (special mechanics, hand-verified): see SKIP below.
 *
 * Output:
 *  - generated bosses: their entry in public/data/monsters.json is updated;
 *  - hand-authored bosses: a `lootOnly` entry in monsters.json that
 *    mergeNpcs() applies over the npcData.ts definition;
 *  - new items are appended to public/data/items.json.
 *
 * Usage: node scripts/refresh-boss-drops-from-wiki.mjs [--only id,id] [--dry]
 */
import { build } from "esbuild";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { batchFetchWikitext, parseDropsLinesFromWikitext, parseWikiQuantity, shouldKeepAlwaysEntry } from "./lib/boss-classifier.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const UA = "osrs-drop-simulator-fan-site (drop table refresh)";
const ICON_OVERRIDES = JSON.parse(readFileSync(path.join(__dirname, "icon-overrides.json"), "utf8"));

// Special mechanics the wiki's per-kill tables don't describe one-to-one.
const SKIP = new Set([
  "barrows-chest", // per-chest model, already verified equal to the wiki per chest
  "lunar-chest",
  "chambers-of-xeric-chest",
  "theatre-of-blood-chest",
  "tombs-of-amascut-chest",
  "tztok-jad", // fire cape/tokkul reward, not a drop table
  "tzkal-zuk",
  "revenant-maledictus", // superior revenant rolling on revenant tables: kept hand-authored
]);

// Drops that are always their own roll in OSRS (never part of a main table).
const TERTIARY_NAME =
  /^(larran's key|brimstone key|slayer's enchantment|ancient shard|dark totem( (base|middle|top))?|curved bone|long bone|mossy key|giant key|sinister key|scroll box \(.+\)|jar of .+)$|^clue scroll \(|champion scroll$|^ensouled /i;
// Wiki section names that describe a separate roll rather than part of the main table.
const SEPARATE_SECTION = /unique|pre-?roll|special|secondary|supply|orb table|staff table|tertiary/i;

const args = process.argv.slice(2);
const ONLY = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const DRY = args.includes("--dry");

const slugify = (name) => name.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const img = (name) => ICON_OVERRIDES[name] ?? `https://oldschool.runescape.wiki/images/${name.replace(/ /g, "_")}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function dropslineRows(page) {
  const q = `bucket('dropsline').select('page_name','drop_json').where('page_name','${page.replace(/'/g, "\\'")}').limit(2000).run()`;
  const j = await fetchJson(`https://oldschool.runescape.wiki/api.php?action=bucket&format=json&query=${encodeURIComponent(q)}`);
  await sleep(150);
  return (j.bucket ?? []).map((r) => JSON.parse(r.drop_json));
}

/** "1/128", "~1/50", "5/2,730", "1/416.7" -> {numerator, denominator} | null */
function parseRate(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/[~,\s]/g, "").toLowerCase();
  if (s === "always" || s === "100%") return { numerator: 1, denominator: 1 };
  const m = s.match(/^([\d.]+)\/([\d.]+)$/);
  if (m && Number(m[2]) > 0) return { numerator: Number(m[1]), denominator: Number(m[2]) };
  const words = { common: 8, uncommon: 32, rare: 128, veryrare: 512 };
  if (s in words) return { numerator: 1, denominator: words[s] };
  return null;
}

async function main() {
  const outfile = path.join(mkdtempSync(path.join(tmpdir(), "npcdata-")), "npcData.cjs");
  await build({ entryPoints: [path.join(ROOT, "src/data/npcData.ts")], bundle: true, platform: "node", format: "cjs", outfile });
  const { mergeNpcs } = await import(`file://${outfile}`);

  const monstersPath = path.join(ROOT, "public/data/monsters.json");
  const itemsPath = path.join(ROOT, "public/data/items.json");
  const monsters = JSON.parse(readFileSync(monstersPath, "utf8"));
  const items = JSON.parse(readFileSync(itemsPath, "utf8"));
  const npcs = mergeNpcs(monsters).filter((n) => !SKIP.has(n.id) && (!ONLY || ONLY.has(n.id)));
  const generatedIds = new Set(monsters.filter((m) => !m.lootOnly).map((m) => m.id));

  // Existing catalog, matched by name (case-insensitive) and by slug.
  const itemIdByName = new Map(Object.values(items).map((it) => [it.name.toLowerCase(), it.id]));
  const handcraftedItemText = readFileSync(path.join(ROOT, "src/data/npcData.ts"), "utf8");

  console.log(`Fetching wikitext for ${npcs.length} bosses...`);
  const wikitextByTitle = await batchFetchWikitext(npcs.map((n) => n.name));

  const pending = [];
  const newItemNames = new Set();
  const report = [];

  for (const npc of npcs) {
    const rows = await dropslineRows(npc.name);
    if (!rows.length) {
      report.push(`${npc.id}: no wiki drop data, left unchanged`);
      continue;
    }
    // Use the main variant (e.g. "Vorkath#Post-quest", "Obor#Members").
    const bySection = new Map();
    for (const r of rows) bySection.set(r["Dropped from"], [...(bySection.get(r["Dropped from"]) ?? []), r]);
    const [section, sectionRows] = [...bySection.entries()].sort((a, b) => b[1].length - a[1].length)[0];

    const lines = parseDropsLinesFromWikitext(wikitextByTitle[npc.name] ?? "");
    const linesByName = new Map();
    for (const l of lines) linesByName.set(l.name.toLowerCase(), [...(linesByName.get(l.name.toLowerCase()) ?? []), l]);

    const groupItemIds = new Set((npc.tertiaryGroups ?? []).flatMap((g) => g.items.map((it) => it.itemId)));

    const always = [];
    const main = [];
    const tertiary = [];
    let mainRolls = 1;
    for (const r of sectionRows) {
      const name = r["Dropped item"];
      if (!name || /^nothing$/i.test(name)) continue; // empty rolls become the explicit "nothing" filler below
      const rate = parseRate(r.Rarity);
      if (!rate) {
        report.push(`${npc.id}: skipped "${name}" (rarity "${r.Rarity}" has no number)`);
        continue;
      }
      const itemId = name.toLowerCase() === "coins" ? "coins" : itemIdByName.get(name.toLowerCase()) ?? slugify(name);
      if (groupItemIds.has(itemId)) continue; // already modelled as a tertiaryGroup

      // Find this exact row in the page wikitext (same item and rate) for its section and noted flag.
      const p = rate.numerator / rate.denominator;
      const candidates = linesByName.get(name.toLowerCase()) ?? [];
      // Exact match first; otherwise the page's only line for this item (its rate
      // may be written as a template/formula, e.g. Brimstone key). An item that
      // ALSO appears at a different rate (e.g. a rare-drop-table copy of a rune
      // 2h sword) only falls back when it's the item's sole line.
      const line =
        candidates.find((l) => {
          const lr = parseRate(l.rarity);
          return lr && Math.abs(lr.numerator / lr.denominator - p) / p < 0.02;
        }) ?? (candidates.length === 1 && !parseRate(candidates[0].rarity) ? candidates[0] : null) ??
        (candidates.length > 0 && candidates.every((l) => l.section.trim().toLowerCase() === "tertiary") ? candidates[0] : null);
      const q = line ? parseWikiQuantity(line.quantity) : { noted: false };
      const isAlways = p >= 1;
      if (isAlways && !shouldKeepAlwaysEntry(r["Rarity Notes"] ?? line?.raritynotes ?? "")) continue;

      const known = items[itemId];
      if (!known && itemId !== "coins") newItemNames.add(name);
      const lo = Number(r["Quantity Low"]) || 1;
      const hi = Number(r["Quantity High"]) || lo;
      const stackable = known ? known.stackable : false;
      const noted = Boolean(line?.noted || q.noted || (!line && !stackable && hi > 1));
      const entry = { itemId, minQuantity: lo, maxQuantity: hi, numerator: rate.numerator, denominator: rate.denominator, ...(noted ? { noted: true } : {}) };

      if (isAlways) always.push({ ...entry, numerator: 1, denominator: 1 });
      else if (line && line.section.trim().toLowerCase() === "tertiary") tertiary.push(entry);
      // Known independent-roll drops whose page rate is a formula/template (so they
      // can't be matched to a page line): keys, enchantments, clues, pets, jars...
      else if (!line && (TERTIARY_NAME.test(name) || known?.pet)) tertiary.push(entry);
      else {
        const rolls = line ? line.rolls ?? 1 : null;
        // Rows not in the wikitext are rare/gem drop table expansions: part of the main table.
        main.push({ entry, rolls, section: line ? line.section.trim() : "(rare/gem drop table)", wikiRolls: Number(r.Rolls) || 1 });
        if (rolls && rolls > mainRolls) mainRolls = rolls;
      }
    }

    // A sub-table the wiki says is rolled MORE times than the main table (e.g.
    // Corporeal Beast: "a 12/512 chance of rolling the gem drop table, whereupon
    // its contents are rolled 10 times") can't sit inside one main-table pick:
    // roll each of its items separately at its full chance per kill instead.
    for (let i = main.length - 1; i >= 0; i--) {
      const m = main[i];
      if (m.rolls === null && m.wikiRolls > mainRolls) {
        tertiary.push({ ...m.entry, numerator: m.entry.numerator * m.wikiRolls });
        main.splice(i, 1);
      }
    }

    // Rows rolled a different number of times than the main table keep the
    // same expected drops per kill. Rows not in the wikitext (rare/gem drop
    // table expansions) are already per main-table roll.
    if (process.env.DEBUG_DROPS) for (const m of main) console.log("  main", m.section, m.entry.itemId, m.entry.numerator + "/" + m.entry.denominator, "rolls=" + m.rolls);
    // Unmatched rows use the wiki bucket's own roll count (same thing, from the other source).
    let mainRows = main.map(({ entry, rolls, wikiRolls, section: sec }) => {
      const r = rolls ?? wikiRolls ?? mainRolls;
      return { sec, entry: r === mainRolls ? entry : { ...entry, numerator: (entry.numerator * r) / mainRolls } };
    });
    const sumOf = (list) => list.reduce((s, r) => s + r.entry.numerator / r.entry.denominator, 0);

    // A boss whose non-tertiary sections add up to more than one pick per roll
    // isn't one table: it has separately-rolled sections (DT2/Nex/wilderness
    // unique rolls, Hespori seeds...). Turn whole sections into independent
    // rolls (uniques first, then the smallest) until the rest fits in one
    // table. Every item keeps exactly its wiki chance per kill either way.
    // Try every combination of sections to roll separately and keep the one
    // that leaves the main table closest to exactly one pick per roll,
    // preferring sections the wiki itself names as separate rolls.
    let movedSections = [];
    if (sumOf(mainRows) > 1.005) {
      const sums = new Map();
      for (const r of mainRows) if (r.sec !== "(rare/gem drop table)") sums.set(r.sec, (sums.get(r.sec) ?? 0) + r.entry.numerator / r.entry.denominator);
      const names = [...sums.keys()];
      const total = sumOf(mainRows);
      let best = null;
      for (let mask = 1; mask < 1 << names.length && names.length <= 14; mask++) {
        const moved = names.filter((_, i) => mask & (1 << i));
        const remaining = total - moved.reduce((s, n) => s + sums.get(n), 0);
        if (remaining > 1.005 || remaining <= 0) continue;
        const separateNamed = moved.filter((n) => SEPARATE_SECTION.test(n)).length;
        // Score: closeness to 1, then sections the wiki names as separate, then fewer moves.
        const score = Math.abs(1 - remaining) * 1000 - separateNamed * 2 + moved.length * 0.5;
        if (!best || score < best.score) best = { score, moved };
      }
      if (best) {
        movedSections = best.moved;
        for (const r of mainRows.filter((x) => movedSections.includes(x.sec))) {
          tertiary.push({ ...r.entry, numerator: r.entry.numerator * mainRolls }); // same chance per kill
        }
        mainRows = mainRows.filter((x) => !movedSections.includes(x.sec));
      }
    }
    const mainTable = mainRows.map((r) => r.entry);
    const sum = sumOf(mainRows);
    if (movedSections.length) report.push(`${npc.id}: rolled separately (as on the wiki): ${movedSections.join(", ")}`);
    if (sum > 0 && sum < 0.995) {
      mainTable.push({ itemId: "nothing", minQuantity: 0, maxQuantity: 0, numerator: Number((1 - sum).toFixed(8)), denominator: 1 });
    }
    if (sum > 1.02) report.push(`${npc.id}: WARNING main table adds up to ${sum.toFixed(3)} per roll (check tertiary classification)`);

    pending.push({ npc, section, always, mainTable, mainRolls, tertiary, sum });
    report.push(
      `${npc.id}: ${section}, ${always.length} always, ${mainTable.length} main x${mainRolls} (sum ${sum.toFixed(3)}), ${tertiary.length} tertiary` +
        `  [was ${npc.always.length}/${npc.mainTable.length} x${npc.mainRolls ?? 1}/${npc.tertiary.length}]`,
    );
  }

  // Resolve brand-new items (same validation rules as generate-bosses-from-wiki.mjs).
  const names = [...newItemNames];
  console.log(`Resolving ${names.length} new items...`);
  const [mapping, latest] = await Promise.all([
    fetchJson("https://prices.runescape.wiki/api/v1/osrs/mapping"),
    fetchJson("https://prices.runescape.wiki/api/v1/osrs/latest"),
  ]);
  const mappingByName = new Map(mapping.map((it) => [it.name.toLowerCase(), it]));
  // Variant names ("Blighted super restore(3)", "Pendant of Ates#Inert",
  // "Bottomless milk bucket (empty)") live on their base item's page.
  const baseName = (n) => n.replace(/#.*$/, "").replace(/\s*\(\d\)$/, "").replace(/\s*\((empty|inert|full)\)$/i, "").trim();
  const itemWikitext = await batchFetchWikitext([...new Set([...names, ...names.map(baseName)])]);
  const field = (wt, f) => {
    const start = wt.indexOf("{{Infobox Item");
    if (start === -1) return null;
    const m = wt.slice(start, wt.indexOf("\n}}", start)).match(new RegExp(`\\n\\|\\s*${f}\\d?\\s*=\\s*([^\\n]*)`, "i"));
    return m ? m[1].trim() : null;
  };
  const invalid = new Set();
  const added = {};
  for (const name of names) {
    const id = slugify(name);
    const wt = itemWikitext[name]?.includes("{{Infobox Item") ? itemWikitext[name] : itemWikitext[baseName(name)] ?? "";
    const mapped = mappingByName.get(name.toLowerCase()) ?? mappingByName.get(name.replace(/#(\w+)$/, " ($1)").toLowerCase());
    if (!mapped && !wt.includes("{{Infobox Item")) {
      invalid.add(id);
      continue;
    }
    const stackable = (field(wt, "stackable") ?? "").toLowerCase() === "yes";
    const price = mapped ? latest.data[String(mapped.id)] : null;
    const value = price ? Math.round(((price.high ?? price.low ?? 0) + (price.low ?? price.high ?? 0)) / 2) : mapped?.value ?? 0;
    added[id] = {
      id,
      name: mapped?.name ?? name.replace(/#(\w+)$/, (_, v) => ` (${v.toLowerCase()})`),
      iconUrl: img(mapped ? mapped.icon.replace(/\.png$/i, "") : name),
      members: mapped ? Boolean(mapped.members) : (field(wt, "members") ?? "yes").toLowerCase() === "yes",
      value,
      tradeable: mapped ? true : (field(wt, "tradeable") ?? "").toLowerCase() === "yes",
      stackable,
    };
  }
  if (invalid.size) report.push(`Dropped entries for names that aren't real items: ${[...invalid].join(", ")}`);

  // Apply.
  for (const pnd of pending) {
    const clean = (list) => list.filter((e) => e.itemId === "nothing" || e.itemId === "coins" || items[e.itemId] || added[e.itemId]);
    // Noted flag for brand-new non-stackable items with quantity > 1 (stackability only known now).
    const fixNoted = (list) =>
      list.map((e) => (added[e.itemId] && !added[e.itemId].stackable && e.maxQuantity > 1 && !e.noted ? { ...e, noted: true } : e));
    const loot = {
      always: fixNoted(clean(pnd.always)),
      mainTable: fixNoted(clean(pnd.mainTable)),
      tertiary: fixNoted(clean(pnd.tertiary)),
    };
    // Re-balance "nothing" if invalid names were removed from the main table.
    const realSum = loot.mainTable.filter((e) => e.itemId !== "nothing").reduce((s, e) => s + e.numerator / e.denominator, 0);
    loot.mainTable = loot.mainTable.filter((e) => e.itemId !== "nothing");
    if (realSum > 0 && realSum < 0.995) loot.mainTable.push({ itemId: "nothing", minQuantity: 0, maxQuantity: 0, numerator: Number((1 - realSum).toFixed(8)), denominator: 1 });

    const fields = { ...loot, ...(pnd.mainRolls > 1 ? { mainRolls: pnd.mainRolls } : {}) };
    if (generatedIds.has(pnd.npc.id)) {
      const m = monsters.find((x) => x.id === pnd.npc.id && !x.lootOnly);
      delete m.mainRolls;
      Object.assign(m, fields);
    } else {
      const idx = monsters.findIndex((x) => x.id === pnd.npc.id && x.lootOnly);
      const entry = { id: pnd.npc.id, name: pnd.npc.name, lootOnly: true, lootSource: "wiki", ...fields };
      if (idx >= 0) monsters[idx] = entry;
      else monsters.push(entry);
    }
  }

  console.log(report.join("\n"));
  console.log(`\n${pending.length} bosses refreshed, ${Object.keys(added).length} new items.`);
  if (handcraftedItemText.includes("'nothing'")) console.warn("Note: an item with id 'nothing' exists in npcData.ts; the filler id would collide.");
  if (DRY) return console.log("(dry run: nothing written)");
  writeFileSync(monstersPath, JSON.stringify(monsters, null, 2));
  writeFileSync(itemsPath, JSON.stringify({ ...items, ...added }, null, 2));
  console.log("Wrote public/data/monsters.json and public/data/items.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
