// Shared "is this actually a real, repeatable OSRS boss" classification,
// used by both generate-monsters.mjs (filters osrsreboxed's stale/loose
// "bosses" category tag) and generate-bosses-from-wiki.mjs (filters
// Category:Bosses page members). The wiki's Category:Bosses is the
// authoritative "is this a boss" list, but it also includes things that
// don't belong in a repeat-kill drop simulator: raid rooms only ever
// fought as one stage of a full raid (rewards come from the raid's shared
// points roll, not a per-kill table on that one room), and one-time quest
// encounters that can never be fought again after completing that quest.

const UA = "osrs-drop-simulator-fan-site (data build script)";
const WIKI_API = "https://oldschool.runescape.wiki/api.php";

export function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function fetchWikiBossNames() {
  const members = [];
  let cmcontinue;
  do {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: "Category:Bosses",
      cmlimit: "500",
      format: "json",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);
    const res = await fetch(`${WIKI_API}?${params}`, { headers: { "User-Agent": UA } });
    const data = await res.json();
    members.push(...data.query.categorymembers.map((m) => m.title));
    cmcontinue = data.continue?.cmcontinue;
  } while (cmcontinue);
  // Category:Bosses also has a pile of illustrative screenshots tagged into
  // it (File: namespace) plus its own overview page — neither is a monster.
  return members.filter((t) => t !== "Boss" && !t.startsWith("Category:") && !t.startsWith("File:"));
}

export async function batchFetchWikitext(titles) {
  const result = {};
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const params = new URLSearchParams({
      action: "query",
      titles: chunk.join("|"),
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      redirects: "1",
      format: "json",
    });
    const res = await fetch(`${WIKI_API}?${params}`, { headers: { "User-Agent": UA } });
    const data = await res.json();
    for (const page of Object.values(data.query.pages ?? {})) {
      if (page.revisions) result[page.title] = page.revisions[0].slots.main["*"];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return result;
}

/** True for a page that's specifically the one-time quest encounter version
 * of a boss that also has a separate, real repeatable version elsewhere
 * (Nightmare Zone, post-quest spawn, etc.) — the wiki's own disambiguation
 * template says so explicitly, e.g. "the quest boss fought during Desert
 * Treasure I" vs "the Nightmare Zone variant". Checked against real
 * repeatable bosses that merely originated from a quest (Vorkath, Ulfric)
 * to confirm this doesn't false-positive on those — a plain
 * Category:Quest monsters tag alone does, this specific phrasing doesn't. */
export function isQuestOnlyVariant(wikitext) {
  return /\{\{Otheruses\|[^}]*quest boss[^}]*\}\}/i.test(wikitext);
}

// Raid room bosses: only ever encountered as one stage of a full raid
// (Theatre of Blood / Tombs of Amascut / Chambers of Xeric), fought in a
// fixed sequence with the others, with rewards coming from the raid's
// shared points-based roll at the end rather than a per-kill drop table on
// that specific room boss. No clean structural signal for this on the wiki
// (no shared category tag), so it's a fixed list — OSRS only has three
// raids, and their rosters rarely change.
export const RAID_ROOM_BOSSES = new Set([
  "The Maiden of Sugadinti",
  "Pestilent Bloat",
  "Nylocas Vasilias",
  "Sotetseg",
  "Xarpus",
  "Verzik Vitur",
  "Akkha",
  "Ba-Ba",
  "Kephri",
  "Zebak",
  "Elidinis' Warden",
  "Tumeken's Warden",
  "Great Olm",
  "Tekton",
  "Vasa Nistirio",
  "Vespula",
  "Muttadile",
  "Vanguard",
  "Ice demon",
]);

// One-time quest encounters manually confirmed via each page's own text —
// either the `{{Otheruses|...quest boss...}}` pattern above, or (where that
// specific phrasing wasn't present) no respawn field and no indication of
// any repeatable/Nightmare Zone version existing anywhere. Unlike the
// auto-detected quest-only-variant case, these needed individual research
// since osrsreboxed's stale data had already tagged some of them as
// "bosses" without that context. New entries here need the same
// verification — don't add a name just because it looks quest-flavored
// (Vorkath and Ulfric both originate from quests and are real content).
export const KNOWN_ONE_OFF_BOSSES = new Set([
  "Black demon",
  "Evil spirit",
  "Arrg",
  "Damis",
  "Giant Roc",
  "Me",
  "Giant Scarab",
  "Slash Bash",
  "Moss Guardian",
  "Agrith Naar",
  "Agrith-Na-Na",
  "Dagannoth mother",
  "Sigmund",
  "Giant Sea Snake",
  "Bouncer",
  "Slagilith",
  "Jungle Demon",
  "Culinaromancer",
  "Dad",
  "Karamel",
  "Fareed",
  "Flambeed",
  "Glod",
  "Dessourt",
  "Kamil",
  "Black Knight Titan",
  "Chronozon",
  "Sir Mordred",
]);

// Real, repeatable Category:Bosses members that still don't belong here:
// either they're not on the OSRS Wiki's own curated "List of bosses"
// overview page (the authoritative roster this project follows), or their
// drop table can't be honestly represented by a per-kill DropsLine scrape
// (Mimic's real reward is a guaranteed pick from the clue-reward pool, not
// a rollable drop table — the scraper only ever captured its 2 mahogany
// planks; Demonic Brutus's own wiki text says "his only drop is a cosmetic
// pair of Brutus slippers and an increased drop rate for Beef" — nothing of
// actual value, a "waste of money to unlock"). Ulfric, Melzar the Mad, and
// Salarin the twisted are all genuine Category:Bosses members but none
// appear on the curated List of bosses page.
export const EXCLUDED_NOT_ON_CURATED_LIST = new Set(["Ulfric", "Melzar the Mad", "Salarin the twisted", "The Mimic", "Demonic Brutus"]);

export function isRealRepeatableBoss(name) {
  return !RAID_ROOM_BOSSES.has(name) && !KNOWN_ONE_OFF_BOSSES.has(name) && !EXCLUDED_NOT_ON_CURATED_LIST.has(name);
}

const RARITY_WORD_DENOMINATOR = { always: 1, common: 8, uncommon: 32, rare: 128, "very rare": 512 };

/** Wiki rarity values are either "Always", an exact fraction ("1/516"), or
 * (mostly for bulk resource drops) a bare tier word with no exact number
 * given anywhere on the page. Tier words get a representative denominator
 * rather than a fabricated precise one. */
export function parseWikiRarity(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === "always" || s === "100%") return { numerator: 1, denominator: 1 };
  const frac = s.match(/^(\d[\d,.]*)\s*\/\s*(\d[\d,.]*)/);
  if (frac) return { numerator: Number(frac[1].replace(/,/g, "")), denominator: Number(frac[2].replace(/,/g, "")) };
  if (s in RARITY_WORD_DENOMINATOR) return { numerator: 1, denominator: RARITY_WORD_DENOMINATOR[s] };
  return null;
}

/** Reward-casket pages (and a few other tables) write rarity denominators
 * as MediaWiki `{{#expr: ... }}` parser-function calls instead of a plain
 * number — e.g. `10/{{#expr:11 * 31}}` — since the real denominator is a
 * product of several sub-table sizes. Left unevaluated, parseWikiRarity
 * can't read the denominator at all and the whole row gets silently
 * dropped. Every case seen across the reward-casket pages is plain
 * arithmetic (*, /, +, -, parentheses) with an optional trailing
 * "round N" — so this evaluates that safely (character-whitelisted, no
 * function calls) rather than pulling in a full expression parser. */
export function evalWikiExprTemplates(wikitext) {
  return wikitext.replace(/\{\{#expr:\s*([^{}]*?)\s*\}\}/g, (whole, expr) => {
    const roundMatch = expr.match(/^(.*?)\s+round\s+(-?\d+)$/i);
    const mathPart = roundMatch ? roundMatch[1] : expr;
    if (!/^[\d\s.+\-*/()]+$/.test(mathPart)) return whole; // not plain arithmetic — leave untouched rather than risk a wrong eval
    let value;
    try {
      // eslint-disable-next-line no-new-func
      value = Function(`"use strict"; return (${mathPart});`)();
    } catch {
      return whole;
    }
    if (typeof value !== "number" || !Number.isFinite(value)) return whole;
    if (roundMatch) {
      const decimals = Math.max(0, Number(roundMatch[2]));
      value = Number(value.toFixed(decimals));
    }
    return String(value);
  });
}

/** Wiki quantity values are either a plain number, a "min-max" range, or
 * either of those followed by " (noted)" — the wiki's own convention for
 * marking a drop as noted, distinct from (and far more common than) an
 * explicit `|noted=yes` DropsLine parameter. A naive Number()/range parse of
 * "8 (noted)" fails silently and both loses the real quantity and drops the
 * noted flag entirely — this strips that suffix first so both are captured. */
export function parseWikiQuantity(raw) {
  if (raw === undefined || raw === null) return { min: 1, max: 1, noted: false };
  const noted = /\(\s*noted\s*\)/i.test(raw);
  const cleaned = String(raw).replace(/\(\s*noted\s*\)/i, "").replace(/&nbsp;/g, "").trim();
  const range = cleaned.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)/);
  if (range) return { min: Number(range[1].replace(/,/g, "")), max: Number(range[2].replace(/,/g, "")), noted };
  // A handful of pages (confirmed: Duke Sucellus, Vardorvis, The Whisperer,
  // The Leviathan) write a min-max range with a single bare comma or
  // semicolon instead of the usual dash, e.g. "216,325" or "280; 420"
  // meaning 216-325 / 280-420 — not the huge single quantities 216325 /
  // 280420 that naive comma-stripping would otherwise produce. Confirmed
  // via raw wikitext that this wiki never uses a comma as a thousands
  // separator in a genuine single quantity (large flat drops are written
  // as e.g. "40000", not "40,000"), so a lone comma/semicolon here is
  // unambiguously a range separator, not grouping.
  const commaRange = cleaned.match(/^(\d+)\s*[,;]\s*(\d+)$/);
  if (commaRange) {
    const min = Number(commaRange[1]);
    const max = Number(commaRange[2]);
    if (min <= max) return { min, max, noted };
  }
  const n = Number(cleaned.replace(/,/g, ""));
  return { min: Number.isFinite(n) ? n : 1, max: Number.isFinite(n) ? n : 1, noted };
}

// Section headers that mark a mutually-exclusive ALTERNATE encounter mode
// rather than the standard per-kill table — e.g. Yama's "===Contract==="
// section (only rolled during a special contract fight, not a normal kill;
// items there are wrongly tagged "rarity=Always" because they're the
// contract's guaranteed reward, not an always-drop on every normal kill) and
// "===Junk===" (only rolled for players under 15% contribution, mutually
// exclusive with the real table this project simulates at 100% contribution).
// "Mimic rewards" (a subsection of Elite/Master reward-casket pages) is the
// loot table for optionally fighting The Mimic boss when a reward casket
// turns into one (a 1/35 or 1/15 chance, opt-in, and not one of the casket's
// normal 4-6 reward rolls) — a mutually-exclusive alternate encounter, same
// category as Yama's Contract, and consistent with this project's existing,
// deliberate exclusion of The Mimic as a boss (EXCLUDED_NOT_ON_CURATED_LIST
// above): its real reward can't be honestly represented as a per-open drop.
const ALTERNATE_MODE_SECTIONS = new Set(["contract", "junk", "mimic rewards"]);

// A handful of boss pages put TWO complete, sibling drop tables under two
// separate level-2 (==Heading==) sections rather than one shared table with
// per-line footnotes — e.g. Obor/Bryophyta (OSRS's only two F2P-repeatable
// bosses) list "==Members' worlds drops==" and "==Free-to-play worlds
// drops==" side by side with near-identical item lists; Scurrius lists
// "==Drops (MVP/Solo)==" and "==Drops (non-MVP)==" (this project already
// simulates every kill as solo/MVP, same rule as the raritynotes-based
// MVP_DAMAGE_RARITYNOTES_RE handling below); Maggot King lists "==Drops
// (take-eggs)==" and "==Drops (open-stomach)==", two mutually-exclusive
// corpse-looting choices (open-stomach is the fuller, more representative
// table — take-eggs trades away normal loot for a boosted pet chance).
// parseDropsLinesFromWikitext only ever tracked the innermost ===/====
// heading, so it had no way to tell these apart and merged both sibling
// tables into one, roughly doubling most items' effective rate (worse for
// `tertiary`/`always` entries, which roll independently or are guaranteed
// every kill, than for `mainTable`, which is one weighted pick regardless of
// pool size). This is a hand-verified exclusion list, same pattern as
// ALTERNATE_MODE_SECTIONS above — matched against the nearest level-2
// ancestor heading, case-insensitively.
const NON_CANONICAL_TOP_SECTIONS = new Set(["free-to-play worlds drops", "drops (non-mvp)", "drops (take-eggs)"]);

const CLUE_ITEM_BY_TYPE = {
  beginner: "Clue scroll (beginner)",
  easy: "Clue scroll (easy)",
  medium: "Clue scroll (medium)",
  hard: "Clue scroll (hard)",
  elite: "Clue scroll (elite)",
  master: "Clue scroll (master)",
};

/** Scans wikitext for every top-level {{TemplateName|...}} call whose name is
 * in `names`, returning each match's raw inner content (everything after the
 * name, before the final closing "}}") and its start index. Tracks brace
 * depth across BOTH {{ }} (nested templates, e.g. a citation inside a
 * DropsLine parameter) and [[ ]] (wiki links, which can themselves contain a
 * "|" for display text) so a naive scan doesn't mistake a nested template's
 * own closing "}}" — or a link's internal "|" — for the outer call's end.
 * A plain regex with `[^}]*` breaks the instant any DropsLine parameter
 * value contains a nested template like `{{Refn|...}}`: it matches up to
 * that inner template's own "}}" and truncates everything after it,
 * silently losing whichever parameter (usually rarity) came next. This is
 * why Yama's "Weapons and armour" drops (which use `quantitynotes={{Refn|
 * ...}}`) were going missing even after the case-sensitivity fix. */
function findBalancedTemplateCalls(wikitext, names) {
  const results = [];
  const nameSet = new Set(names);
  for (let i = 0; i < wikitext.length - 1; i++) {
    if (wikitext[i] !== "{" || wikitext[i + 1] !== "{") continue;
    const nameMatch = /^([A-Za-z]+)([|}])/.exec(wikitext.slice(i + 2, i + 40));
    if (!nameMatch || !nameSet.has(nameMatch[1])) continue;
    const contentStart = i + 2 + nameMatch[1].length + (nameMatch[2] === "|" ? 1 : 0);

    let depth = 1;
    let j = contentStart;
    for (; j < wikitext.length; j++) {
      if (wikitext[j] === "{" && wikitext[j + 1] === "{") {
        depth++;
        j++;
      } else if (wikitext[j] === "}" && wikitext[j + 1] === "}") {
        depth--;
        j++;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue; // unterminated — malformed wikitext, skip

    results.push({ name: nameMatch[1], content: wikitext.slice(contentStart, j - 1), index: i });
    i = j; // resume scanning after this whole call
  }
  return results;
}

/** Splits a template's inner content on "|" at depth 0 only — a pipe inside
 * a nested {{ }} or [[ ]] (e.g. a citation's own params, or a [[Link|text]])
 * doesn't count as a parameter separator. */
function splitTopLevelPipes(str) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < str.length; i++) {
    const two = str.slice(i, i + 2);
    if (two === "{{" || two === "[[") {
      depth++;
      current += two;
      i++;
    } else if (two === "}}" || two === "]]") {
      depth = Math.max(0, depth - 1);
      current += two;
      i++;
    } else if (str[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += str[i];
    }
  }
  parts.push(current);
  return parts;
}

/** Parses every {{DropsLine|...}} and {{DropsLineClue|...}} on a boss page,
 * tagged with which section header (===Section===) it fell under. Parameter
 * keys are matched case-insensitively — the wiki's own editors aren't
 * consistent (`rarity=` vs `Rarity=`, `quantity=` vs `Quantity=`), and a
 * case-sensitive lookup silently drops the whole line, which is how Yama's
 * "Runes" section (which happens to use capitalized params) went missing.
 * Skips ALTERNATE_MODE_SECTIONS entirely. */
export function parseDropsLinesFromWikitext(rawWikitext) {
  const wikitext = evalWikiExprTemplates(rawWikitext);
  const lines = [];
  // Matches both ===Section=== and ====Subsection==== headers, returning the
  // innermost (deepest) one active at a given index — needed for pages like
  // a raid's reward chest, which nest "Normal mode"/"Challenge mode" under a
  // shared "Unique drop table" heading.
  const sectionRe = /(={3,4})\s*([^=]+?)\s*\1/g;

  const sectionMarkers = [...wikitext.matchAll(sectionRe)].map((m) => ({ index: m.index, name: m[2] }));
  const sectionAt = (index) => {
    let name = "";
    for (const marker of sectionMarkers) {
      if (marker.index > index) break;
      name = marker.name;
    }
    return name;
  };

  // Level-2 (==Heading==) markers only — tracked separately from the =3/4=
  // ones above so existing ALTERNATE_MODE_SECTIONS behavior (matched against
  // the innermost heading) is untouched. A real "==Heading==" line has
  // nothing but "=" immediately outside the two marker "="s; requiring the
  // captured text to start with a non-"=" character is what keeps this from
  // also matching a "===Heading===" (===) or "====Heading====" line, which
  // would otherwise match the "==" prefix/suffix of a longer marker.
  const topSectionRe = /^==([^=\n][^\n]*?)==\s*$/gm;
  const topSectionMarkers = [...wikitext.matchAll(topSectionRe)].map((m) => ({ index: m.index, name: m[1].trim() }));
  const topSectionAt = (index) => {
    let name = "";
    for (const marker of topSectionMarkers) {
      if (marker.index > index) break;
      name = marker.name;
    }
    return name;
  };

  const calls = findBalancedTemplateCalls(wikitext, ["DropsLine", "DropsLineClue", "DropsLineReward"]);
  for (const call of calls) {
    const currentSection = sectionAt(call.index);
    if (ALTERNATE_MODE_SECTIONS.has(currentSection.trim().toLowerCase())) continue;
    if (NON_CANONICAL_TOP_SECTIONS.has(topSectionAt(call.index).toLowerCase())) continue;

    const params = {};
    for (const p of splitTopLevelPipes(call.content)) {
      const eq = p.indexOf("=");
      const key = (eq === -1 ? p : p.slice(0, eq)).trim().toLowerCase();
      const value = eq === -1 ? "" : p.slice(eq + 1).trim();
      if (key) params[key] = value;
    }

    const rolls = params.rolls ? Number(params.rolls) : 1;

    if (call.name === "DropsLineClue") {
      const name = CLUE_ITEM_BY_TYPE[(params.type ?? "").toLowerCase()];
      if (!name) continue;
      lines.push({ name, quantity: "1", rarity: params.rarity, noted: false, section: currentSection, rolls, raritynotes: params.raritynotes });
      continue;
    }

    if (!params.name) continue;
    lines.push({ name: params.name, quantity: params.quantity, rarity: params.rarity, noted: params.noted === "yes", section: currentSection, rolls, raritynotes: params.raritynotes });
  }
  return lines;
}

// A "rarity=Always" DropsLine with a raritynotes footnote is a real signal
// worth checking before trusting: the wiki uses "Always" for guaranteed
// drops in general, but ALSO reuses it for things that are only guaranteed
// under some completely different, non-repeatable, or one-off condition —
// e.g. Duke Sucellus's "Ancient blood ornament kit" ("Only when defeated in
// the awakened encounter as the last of the four"), GWD generals' "Frozen
// key piece" ("only dropped during The Frozen Door miniquest"), Cerberus's
// "Reward casket (elite)" ("only dropped when completing an elite clue
// scroll asking you to kill a hellhound" — an unrelated clue meta-mechanic,
// not a Cerberus drop at all), or Araxxor's "Coagulated venom" (a
// speed-kill achievement reward, gated on both a time limit and not already
// owning one). None of these are real per-kill guaranteed drops, and this
// project has no state to represent "only once" or "only during X" —
// including them fabricates a drop that doesn't happen on a normal kill.
//
// The one exception verified across every wilderness/duo boss that splits
// loot by damage dealt (Callisto, Venenatis, Vet'ion, The Nightmare, The
// Hueycoatl): "Big bones" going to whoever dealt the most damage, with
// "Bones" as the consolation prize for anyone else. Since this whole
// project already simulates every kill as a solo/MVP kill (matches Barrows,
// Revenant maledictus, General Graardor etc.), the MVP variant ("most
// damage"/"MVP") is correctly guaranteed for a solo player and safe to
// keep — its non-MVP counterpart is what should be dropped instead.
const MVP_DAMAGE_RARITYNOTES_RE = /most damage|\bmvp\b/i;
const NON_MVP_RARITYNOTES_RE = /did not deal|not deal the most|eligible.*but/i;

export function shouldKeepAlwaysEntry(raritynotes) {
  if (!raritynotes || !raritynotes.trim()) return true;
  return MVP_DAMAGE_RARITYNOTES_RE.test(raritynotes) && !NON_MVP_RARITYNOTES_RE.test(raritynotes);
}
