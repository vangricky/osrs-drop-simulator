#!/usr/bin/env node
/**
 * Generates a static, zero-JS SEO landing page per boss (public/bosses/<id>/index.html)
 * plus the site's sitemap.xml — the same "static HTML that needs no JS execution to be
 * crawlable" approach as public/faq/index.html, not a React route. Each boss's real drop
 * table can only ever live at one URL (the main app) otherwise, so none of the 65 bosses
 * are individually indexable/rankable for their own name — e.g. "zulrah drop simulator" —
 * no matter how good the single page's own on-page SEO is.
 *
 * Like scripts/export-reference-data.mjs, this transpiles src/data/npcData.ts (plus
 * src/data/petBosses.ts for pet rates) with esbuild and reads the bulk-generated
 * public/data/*.json directly, merging them the same way the browser does — so these
 * pages can never drift out of sync with the real app data. Each generated page links
 * back into the real interactive simulator via /?npc=<id>, which src/App.tsx reads on
 * load to pre-select that boss (see the npc query-param effect there).
 *
 * Re-run after npm run generate-monsters / npm run update-prices, or after any edit to
 * a boss's drop table in npcData.ts. Safe to re-run any time — fully regenerates
 * public/bosses/ and public/sitemap.xml from scratch, nothing is hand-edited downstream.
 */
import { build } from "esbuild";
import { writeFileSync, readFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SITE_URL = "https://osrsdropsimulation.com";
const BOSSES_DIR = path.join(ROOT, "public/bosses");
const today = new Date().toISOString().slice(0, 10);

/** Design tokens + page chrome shared by every generated page (the per-boss
 * pages and the /bosses/ hub index). Page-specific rules stay inline in each
 * page's own <style> block after this. */
const BASE_CSS = `      :root {
        --ink: #0c0a08; --ink-2: #1c1712; --ink-3: #241d15;
        --parchment: #d9c8a0; --parchment-dim: #c3ac7e; --parchment-faint: rgba(217, 200, 160, 0.55);
        --gold: #ffb700; --orange: #ff981f; --text: #ffe4a3;
        --border-light: rgba(156, 138, 99, 0.55); --border-hair: rgba(255, 201, 77, 0.28);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--ink);
        background:
          radial-gradient(ellipse 900px 480px at 50% -10%, rgba(255, 183, 0, 0.14) 0%, transparent 60%),
          radial-gradient(ellipse 1000px 700px at 100% 110%, rgba(79, 143, 255, 0.06) 0%, transparent 55%),
          linear-gradient(180deg, var(--ink) 0%, var(--ink-2) 55%, var(--ink-3) 100%);
        color: var(--text);
        font-family: "Cabin", ui-sans-serif, system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        padding-inline: 20px;
      }
      a { color: inherit; }
      .display { font-family: "Cinzel", serif; }
      .gold-leaf {
        background: linear-gradient(180deg, #ffe9ab, var(--gold) 70%);
        -webkit-background-clip: text; background-clip: text; color: transparent;
        filter: drop-shadow(0 0 12px rgba(255, 183, 0, 0.35));
      }
      header.site {
        max-width: 760px; margin: 14px auto 0; display: flex; align-items: center;
        justify-content: space-between; gap: 12px; padding-block: 10px; flex-wrap: wrap;
      }
      .brand { display: flex; align-items: center; gap: 8px; font-family: "Cinzel", serif; font-weight: 700; font-size: 15px; color: var(--parchment); text-decoration: none; }
      .brand img { height: 24px; width: auto; }
      nav.crumbs { font-size: 12px; color: var(--parchment-faint); }
      nav.crumbs a { text-decoration: none; }
      nav.crumbs a:hover { color: var(--gold); }
      main { max-width: 760px; margin: 0 auto; padding-bottom: 64px; }
      .panel {
        position: relative; border-radius: 14px; border: 1px solid var(--border-hair);
        background-image: linear-gradient(165deg, rgba(74, 65, 54, 0.5) 0%, rgba(18, 14, 9, 0.72) 100%);
        box-shadow: 0 20px 45px -18px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      }
      .panel::before {
        content: ""; position: absolute; inset: 0 0 auto 0; height: 40%; border-radius: inherit;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent); pointer-events: none;
      }`;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Matches src/utils/dropLogic.ts's formatDropRate exactly, so these pages never
 * disagree with the numbers the live simulator itself shows for the same table. */
function formatRate(numerator, denominator) {
  const n = numerator === 1 ? "1" : String(numerator);
  return `${n}/${denominator.toLocaleString("en-US")}`;
}

/**
 * Pet rates only — mirrors src/PetSimApp.tsx's own formatRate, normalising to
 * a plain "1 in N". Pet chances reach here either as a two-step rate already
 * multiplied through (Abyssal Sire's Unsired -> Font conversion, so the
 * numerator isn't 1), or straight off a wiki-scraped table where the
 * denominator can be fractional (Scorpia's offspring is stored as 1/2015.75,
 * and 60 entries across the dataset are like it). Printing those raw gives
 * "1/2,015.75", so pet figures get rounded to the whole number a player would
 * actually recognise. Drop TABLE rows deliberately keep formatRate's
 * unrounded output instead — those have to agree with the live simulator's
 * own table exactly, fractions included.
 */
function formatPetRate(numerator, denominator) {
  return `1/${Math.round(denominator / numerator).toLocaleString("en-US")}`;
}

/**
 * Some in-game pet item names are literally "Pet <name>" (Pet chaos
 * elemental, Pet kraken, Pet snakeling, ...) rather than a standalone name —
 * 13 of the ~40 pet-having bosses. Used as-is in a sentence that already
 * supplies the word "pet" ("the Pet snakeling pet drops at...", "plus the
 * Pet kraken pet rate") reads as a stutter. This is ONLY for sentence
 * contexts that already say "pet" themselves — the raw name (with "Pet "
 * intact) is correct everywhere else, since it's the item's actual name.
 */
function petNameForSentence(petName) {
  return petName.replace(/^Pet /, "");
}

function formatPercent(numerator, denominator) {
  const p = (numerator / denominator) * 100;
  if (p >= 10) return `${p.toFixed(1)}%`;
  if (p >= 1) return `${p.toFixed(2)}%`;
  return `${p.toPrecision(2)}%`;
}

/** Probability of at least one hit across `rolls` independent attempts at the same
 * table, expressed back as a "1 in N" figure for plain-English "effective rate" copy. */
function effectiveOneInN(numerator, denominator, rolls) {
  const p = numerator / denominator;
  const combined = 1 - Math.pow(1 - p, rolls);
  return Math.round(1 / combined);
}

/** Matches src/utils/dropLogic.ts's formatGp exactly. */
function formatGp(amount) {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 100_000) return `${Math.floor(amount / 1000)}K`;
  return amount.toLocaleString("en-US");
}

/** Every entry across always/main/tertiary/tertiaryGroups, deduped by item —
 * a boss's guaranteed drops can double up an item also on its main table
 * (rare, but real), and this is meant to answer "how many DIFFERENT items". */
function uniqueDropStats(npc, items) {
  const ids = new Set();
  const alwaysIds = new Set(npc.always.map((e) => e.itemId));
  for (const e of [...npc.always, ...npc.mainTable, ...npc.tertiary]) ids.add(e.itemId);
  for (const g of npc.tertiaryGroups ?? []) for (const it of g.items) ids.add(it.itemId);
  let tradeable = 0;
  for (const id of ids) if (items[id]?.tradeable) tradeable++;
  return { total: ids.size, guaranteed: alwaysIds.size, tradeable, untradeable: ids.size - tradeable };
}

/** 1-indexed rank by combat level, highest first — a real, stable per-boss
 * fact (unlike anything GP-value-based, which drifts with daily GE prices). */
function combatRank(npc, allNpcs) {
  const sorted = [...allNpcs].sort((a, b) => b.combatLevel - a.combatLevel);
  return sorted.findIndex((n) => n.id === npc.id) + 1;
}

function rarest(entries) {
  return entries.reduce((best, e) => {
    if (e.numerator <= 0) return best;
    const p = e.numerator / e.denominator;
    if (!best || p < best.numerator / best.denominator) return e;
    return best;
  }, null);
}

async function loadDataModule() {
  const entrySrc = `
    export { mergeNpcs, mergeItems, containers } from ${JSON.stringify(path.join(ROOT, "src/data/npcData.ts"))};
    export { getPetBosses } from ${JSON.stringify(path.join(ROOT, "src/data/petBosses.ts"))};
  `;
  const tmpDir = mkdtempSync(path.join(tmpdir(), "bosspages-"));
  const entryPath = path.join(tmpDir, "entry.ts");
  writeFileSync(entryPath, entrySrc);
  const outfile = path.join(tmpDir, "entry.cjs");
  await build({ entryPoints: [entryPath], bundle: true, platform: "node", format: "cjs", outfile });
  return import(`file://${outfile}`);
}

/**
 * Renders a JSON-LD graph as the exact text that will sit BETWEEN the
 * <script type="application/ld+json"> tags, and the CSP hash of that same
 * text. Returning both from one place is the point: a CSP hash has to cover
 * the script element's content byte for byte, surrounding newlines and
 * indentation included, so computing it from the bare JSON while the template
 * interpolates it with a leading newline and trailing indent silently yields
 * a hash that matches nothing (which is what this file did before). Callers
 * must interpolate `body` with no extra whitespace of their own:
 * `<script ...>${body}</script>`.
 */
function jsonLdScript(data) {
  const body = `\n${JSON.stringify(data, null, 2)}\n    `;
  return { body, cspHash: `sha256-${createHash("sha256").update(body).digest("base64")}` };
}

function buildFaq(npc, items, petInfo, stats) {
  const faqs = [];
  const isPet = (e) => petInfo && e.itemId === petInfo.petItemId;
  // Main-table entries are the actual marquee unique rewards (Zulrah's
  // Tanzanite fang, Vorkath's head, etc.) — exactly what "how rare is X from
  // Y" searches are about. Tertiary is mostly clue scrolls and novelty jars,
  // which can be numerically rarer without being what anyone's asking about,
  // so it's only a fallback for the handful of bosses with an empty main
  // table (e.g. ones that are all guaranteed/tertiary drops).
  const notable = rarest(npc.mainTable.filter((e) => !isPet(e))) ?? rarest(npc.tertiary.filter((e) => !isPet(e)));
  const rolls = npc.mainRolls ?? 1;

  if (notable) {
    const item = items[notable.itemId];
    const itemName = item?.name ?? notable.itemId;
    const isMainTable = npc.mainTable.includes(notable);
    let answer = `${itemName} drops at ${formatRate(notable.numerator, notable.denominator)}${isMainTable ? " per main-table roll" : " per kill"}.`;
    if (isMainTable && rolls > 1) {
      answer += ` ${npc.name} rolls its main table ${rolls} times per kill, so the effective rate works out to roughly 1/${effectiveOneInN(notable.numerator, notable.denominator, rolls).toLocaleString("en-US")} kills.`;
    }
    faqs.push({ q: `How rare is the ${itemName} from ${npc.name}?`, a: answer });
  }

  if (petInfo) {
    faqs.push({
      q: `How many ${npc.name} kills for the pet on average?`,
      a: `The ${petNameForSentence(petInfo.petName)} pet drops at ${formatPetRate(petInfo.numerator, petInfo.denominator)}, independent of every other roll — so on average, ${Math.round(petInfo.denominator / petInfo.numerator).toLocaleString("en-US")} kills, though it can drop on kill one or take far longer.`,
    });
  }

  faqs.push({
    q: `How many different items can drop from ${npc.name}?`,
    a: `${stats.total} different item${stats.total === 1 ? "" : "s"} in total — ${stats.guaranteed} guaranteed every kill, the rest from the main and tertiary tables. ${stats.untradeable} of them can't be sold for GP (clue scrolls, pets, and other untradeables).`,
  });

  faqs.push({
    q: `What's the fastest way to see ${npc.name}'s real drop odds without grinding?`,
    a: `Simulate it — roll ${npc.name}'s actual drop table hundreds of times instantly in OSRS Drop Simulator and watch the real long-run rates play out, free and in your browser.`,
  });

  return faqs;
}

function renderTableRows(entries, items, { showPercent } = {}) {
  return entries
    .map((e) => {
      const item = items[e.itemId];
      const name = escapeHtml(item?.name ?? e.itemId);
      const qty = e.minQuantity === e.maxQuantity ? (e.minQuantity > 1 ? ` ×${e.minQuantity.toLocaleString("en-US")}` : "") : ` (${e.minQuantity.toLocaleString("en-US")}–${e.maxQuantity.toLocaleString("en-US")})`;
      const cells = [`<td class="item">${name}${qty}</td>`, `<td class="rate">${formatRate(e.numerator, e.denominator)}</td>`];
      if (showPercent) cells.push(`<td class="pct">${formatPercent(e.numerator, e.denominator)}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("\n          ");
}

function renderGroupBlocks(groups, items) {
  if (!groups?.length) return "";
  return groups
    .map((g, i) => {
      const memberNames = g.items.map((it) => escapeHtml(items[it.itemId]?.name ?? it.itemId)).join(", ");
      return `
    <div class="tbl-block">
      <table>
        <caption>Shared drop${groups.length > 1 ? ` ${i + 1}` : ""} — one of these per hit</caption>
        <thead><tr><th>Possible items</th><th class="rate">Rate</th></tr></thead>
        <tbody>
          <tr><td class="item">${memberNames}</td><td class="rate">${formatRate(g.numerator, g.denominator)}</td></tr>
        </tbody>
      </table>
    </div>`;
    })
    .join("\n");
}

function pickRelated(npc, allNpcs) {
  return [...allNpcs]
    .filter((n) => n.id !== npc.id)
    .sort((a, b) => Math.abs(a.combatLevel - npc.combatLevel) - Math.abs(b.combatLevel - npc.combatLevel))
    .slice(0, 6);
}

function pageHtml(npc, items, allNpcs, petInfo) {
  const slug = npc.id;
  const title = `${npc.name} Drop Simulator — OSRS Drop Rates`;
  // Google truncates meta descriptions at roughly 155-160 characters, and the
  // previous wording ran past that for 59 of the 65 bosses once a long name
  // and/or a pet clause were in play — a mid-sentence cutoff in every one of
  // those search snippets. possessive() avoids "Guardians's" for names that
  // already end in s (Grotesque Guardians, Dagannoth Rex, ...). Verified via
  // scripts/generate-boss-pages.mjs's own dev-time check against the real
  // dataset that this stays under budget for every boss + pet combination,
  // not just the ones sampled while drafting it.
  const possessive = npc.name.endsWith("s") ? `${npc.name}'` : `${npc.name}'s`;
  const description = `Simulate ${possessive} real OSRS drop table for free — exact rates for every item${petInfo ? `, plus the ${petNameForSentence(petInfo.petName)} pet rate` : ""}. Roll instantly, no login.`;
  const canonical = `${SITE_URL}/bosses/${slug}/`;
  const rolls = npc.mainRolls ?? 1;
  const stats = uniqueDropStats(npc, items);
  const rank = combatRank(npc, allNpcs);
  const faqs = buildFaq(npc, items, petInfo, stats);
  const related = pickRelated(npc, allNpcs);

  // Two graphs in one block (an @graph array), so the page still only needs a
  // single inline <script> — and therefore a single CSP hash. BreadcrumbList
  // is what lets Google render "Home › Bosses › <name>" in the result snippet
  // instead of a bare URL, and it mirrors the visible <nav class="crumbs">.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Bosses", item: `${SITE_URL}/bosses/` },
          { "@type": "ListItem", position: 3, name: npc.name, item: canonical },
        ],
      },
    ],
  };
  const { body: jsonLdBody, cspHash } = jsonLdScript(jsonLd);

  const metaChips = [`Combat level <b>${npc.combatLevel.toLocaleString("en-US")}</b>`];
  if (rolls > 1) metaChips.push(`${rolls} main-table rolls per kill`);
  if (petInfo) metaChips.push(`Pet rate <b>${formatPetRate(petInfo.numerator, petInfo.denominator)}</b>`);

  const factList = [
    { label: "Combat level", value: `${npc.combatLevel.toLocaleString("en-US")} (#${rank} of ${allNpcs.length} bosses)` },
    { label: "Unique droppable items", value: `${stats.total} (${stats.guaranteed} guaranteed)` },
    { label: "Tradeable / untradeable", value: `${stats.tradeable} / ${stats.untradeable}` },
    { label: "Main-table rolls per kill", value: `${rolls}` },
    ...(petInfo ? [{ label: "Pet rate", value: formatPetRate(petInfo.numerator, petInfo.denominator) }] : []),
    { label: "Unlock cost in the simulator", value: npc.unlockCost > 0 ? `${formatGp(npc.unlockCost)} gp` : "Free" },
  ];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!--
      Generated by scripts/generate-boss-pages.mjs — do not hand-edit. Genuinely
      static, zero-JS HTML (same approach as public/faq/index.html), so it's
      indexable without a crawler needing to execute anything. The CTA links to
      the real interactive simulator with this boss pre-selected via ?npc=${slug}
      (see the query-param effect in src/App.tsx).
    -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' '${cspHash}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://oldschool.runescape.wiki data:; font-src https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; object-src 'none'"
    />
    <link rel="icon" type="image/png" href="/brand/favicon.png" />
    <link rel="apple-touch-icon" href="/brand/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#3e3529" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://oldschool.runescape.wiki" />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Cabin:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonical}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="OSRS Drop Simulator" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_URL}/brand/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="OSRS Drop Simulator — free browser drop-rate simulator for 65 Old School RuneScape bosses" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SITE_URL}/brand/og-image.jpg" />

    <script type="application/ld+json">${jsonLdBody}</script>

    <style>
${BASE_CSS}
      .hero { margin-top: 18px; padding: 28px 28px 26px; display: flex; gap: 22px; align-items: center; }
      .boss-orb {
        width: 92px; height: 92px; border-radius: 50%; flex-shrink: 0; position: relative;
        background: radial-gradient(circle at 38% 32%, rgba(255, 255, 255, 0.10), rgba(0, 0, 0, 0.35) 70%);
        display: flex; align-items: center; justify-content: center; overflow: hidden;
      }
      .boss-orb::after {
        content: ""; position: absolute; inset: 0; border-radius: 50%;
        box-shadow: 0 0 0 1px var(--border-light), inset 0 0 10px rgba(255,255,255,0.08);
      }
      .boss-orb img { max-width: 70%; max-height: 70%; object-fit: contain; }
      .hero-copy { min-width: 0; }
      .eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--parchment-faint); margin: 0 0 6px; }
      h1 { font-family: "Cinzel", serif; font-weight: 900; font-size: clamp(26px, 4vw, 34px); line-height: 1.15; margin: 0 0 8px; text-wrap: balance; }
      .sub { margin: 0 0 16px; color: var(--parchment); font-size: 15px; line-height: 1.5; max-width: 60ch; }
      .meta-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
      .chip { font-size: 12.5px; padding: 5px 11px; border-radius: 999px; border: 1px solid var(--border-light); background: rgba(0, 0, 0, 0.25); color: var(--parchment-dim); font-variant-numeric: tabular-nums; }
      .chip b { color: var(--gold); font-weight: 600; }
      .cta { display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 10px; background: linear-gradient(180deg, var(--gold), var(--orange)); color: #241d15; font-family: "Cinzel", serif; font-weight: 700; font-size: 14px; text-decoration: none; box-shadow: 0 10px 24px -8px rgba(255, 183, 0, 0.5); }
      section { margin-top: 22px; padding: 24px 28px 28px; }
      h2 { font-family: "Cinzel", serif; font-weight: 700; font-size: 18px; letter-spacing: 0.02em; text-transform: uppercase; margin: 0 0 4px; }
      .section-note { margin: 0 0 18px; font-size: 13.5px; color: var(--parchment-faint); }
      .fact-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 24px; margin: 0; }
      .fact-list > div { display: flex; flex-direction: column; gap: 2px; padding-bottom: 10px; border-bottom: 1px solid rgba(156, 138, 99, 0.15); }
      .fact-list dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--parchment-faint); }
      .fact-list dd { margin: 0; font-size: 15px; color: var(--text); font-weight: 600; font-variant-numeric: tabular-nums; }
      @media (max-width: 480px) { .fact-list { grid-template-columns: 1fr; } }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      caption { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--gold); margin-bottom: 10px; font-weight: 600; }
      th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid rgba(156, 138, 99, 0.18); }
      th { font-weight: 600; color: var(--parchment-faint); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; }
      td.item { color: var(--parchment); }
      td.rate, th.rate { text-align: right; font-variant-numeric: tabular-nums; }
      td.rate { color: var(--gold); font-weight: 600; }
      td.pct, th.pct { text-align: right; color: var(--parchment-faint); font-variant-numeric: tabular-nums; }
      tr:last-child td { border-bottom: none; }
      .tbl-block + .tbl-block { margin-top: 26px; }
      .qa + .qa { margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(156, 138, 99, 0.18); }
      .qa h3 { font-family: "Cabin", sans-serif; font-size: 15px; font-weight: 700; color: var(--text); margin: 0 0 6px; }
      .qa p { margin: 0; color: var(--parchment); font-size: 14px; line-height: 1.6; max-width: 65ch; }
      .related-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .related-grid a { display: block; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-light); background: rgba(0, 0, 0, 0.2); text-decoration: none; color: var(--parchment); font-size: 13.5px; }
      .related-grid a:hover { border-color: var(--border-hair); background: rgba(255, 183, 0, 0.06); }
      .related-grid .name { display: block; font-weight: 600; color: var(--text); margin-bottom: 2px; }
      .related-grid .hint { color: var(--parchment-faint); font-size: 12px; }
      footer { max-width: 760px; margin: 30px auto 0; padding-block: 18px; text-align: center; font-size: 11.5px; color: rgba(217, 200, 160, 0.4); }
      @media (max-width: 640px) {
        .hero { flex-direction: column; align-items: flex-start; text-align: left; }
        .related-grid { grid-template-columns: 1fr; }
        section, .hero { padding: 22px 18px 24px; }
      }
    </style>
  </head>
  <body>
    <header class="site">
      <a class="brand" href="/"><img src="/brand/logo.png" alt="OSRS Drop Simulator" />OSRS Drop Simulator</a>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a> ›
        <a href="/bosses/">Bosses</a> ›
        <span style="color:var(--parchment)">${escapeHtml(npc.name)}</span>
      </nav>
    </header>

    <main>
      <div class="panel hero">
        <div class="boss-orb"><img src="${npc.iconUrl}" alt="${escapeHtml(npc.name)}" width="64" height="64" loading="eager" /></div>
        <div class="hero-copy">
          <p class="eyebrow">Boss drop simulator</p>
          <h1><span class="gold-leaf">${escapeHtml(npc.name)}</span> Drop Simulator — OSRS Drop Rates</h1>
          <p class="sub">${escapeHtml(npc.examine)} At combat level ${npc.combatLevel.toLocaleString("en-US")}, ${escapeHtml(npc.name)} ranks #${rank} of ${allNpcs.length} bosses in OSRS Drop Simulator by difficulty, with ${stats.total} different items across its drop table. Roll it as many times as you want and see exactly what each item actually costs in kills — free, instantly, no login.</p>
          <div class="meta-row">${metaChips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
          <a class="cta" href="/?npc=${slug}">Simulate ${escapeHtml(npc.name)} now <span class="arrow">→</span></a>
        </div>
      </div>

      <section class="panel">
        <h2>Quick facts</h2>
        <p class="section-note">Everything below is derived straight from ${escapeHtml(npc.name)}'s real drop table — the same data the live simulator rolls against.</p>
        <dl class="fact-list">
          ${factList.map((f) => `<div><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(f.value)}</dd></div>`).join("\n          ")}
        </dl>
      </section>

      <section class="panel">
        <h2>${escapeHtml(npc.name)} drop table</h2>
        <p class="section-note">Real published rates${rolls > 1 ? `, current as simulated in-game — ${npc.name} rolls its main table ${rolls} times per kill, on top of the guaranteed drops and independent tertiary rolls below.` : "."}</p>

        ${
          npc.always.length
            ? `<div class="tbl-block table-wrap">
          <table>
            <caption>100% drop — every kill</caption>
            <thead><tr><th>Item</th><th class="rate">Rate</th></tr></thead>
            <tbody>
          ${renderTableRows(npc.always, items)}
            </tbody>
          </table>
        </div>`
            : ""
        }

        ${
          npc.mainTable.length
            ? `<div class="tbl-block table-wrap">
          <table>
            <caption>Main table — one roll${rolls > 1 ? ` ×${rolls}` : ""} per kill</caption>
            <thead><tr><th>Item</th><th class="rate">Rate</th><th class="pct">Chance</th></tr></thead>
            <tbody>
          ${renderTableRows(npc.mainTable, items, { showPercent: true })}
            </tbody>
          </table>
        </div>`
            : ""
        }

        ${renderGroupBlocks(npc.tertiaryGroups, items)}

        ${
          npc.tertiary.length
            ? `<div class="tbl-block table-wrap">
          <table>
            <caption>Tertiary drops — independent rolls</caption>
            <thead><tr><th>Item</th><th class="rate">Rate</th></tr></thead>
            <tbody>
          ${renderTableRows(npc.tertiary, items)}
            </tbody>
          </table>
        </div>`
            : ""
        }
      </section>

      <section class="panel">
        <h2>Common questions</h2>
        ${faqs
          .map(
            (f) => `<div class="qa">
          <h3>${escapeHtml(f.q)}</h3>
          <p>${escapeHtml(f.a)}</p>
        </div>`,
          )
          .join("\n        ")}
      </section>

      <section class="panel">
        <h2>More boss simulators</h2>
        <div class="related-grid">
          ${related
            .map(
              (r) =>
                `<a href="/bosses/${r.id}/"><span class="name">${escapeHtml(r.name)}</span><span class="hint">Combat level ${r.combatLevel.toLocaleString("en-US")}</span></a>`,
            )
            .join("\n          ")}
        </div>
      </section>
    </main>

    <footer>
      Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy.
      This content is not endorsed by or affiliated with Jagex.
    </footer>
  </body>
</html>
`;
}

/**
 * The /bosses/ hub: a plain, static index linking to all 65 boss pages.
 *
 * Without this the per-boss pages are orphans — nothing on the site links to
 * them, they only cross-link to each other, and the sitemap is their sole
 * entry point. Google treats "in the sitemap but zero internal links" as a
 * strong low-importance signal and routinely leaves such URLs at
 * "Discovered - currently not indexed" (which is exactly what Search Console
 * reported for them). This gives every boss page a real inbound link from a
 * page that is itself linked from the FAQ and the in-game menu, so there's a
 * crawlable path from the site root down to each boss.
 */
function hubHtml(bosses, petByNpcId) {
  const title = "All OSRS Boss Drop Tables — Drop Rate Simulator Index";
  const description = `Every OSRS boss's real drop table in one place — ${bosses.length} bosses, exact drop rates, free instant simulator. From Obor to Nex, Yama and the raids.`;
  const canonical = `${SITE_URL}/bosses/`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Bosses", item: canonical },
        ],
      },
      {
        // A real ItemList of every boss page — another machine-readable route
        // into the set, independent of the sitemap.
        "@type": "ItemList",
        name: "OSRS bosses with simulated drop tables",
        numberOfItems: bosses.length,
        itemListElement: bosses.map((npc, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: npc.name,
          url: `${SITE_URL}/bosses/${npc.id}/`,
        })),
      },
    ],
  };
  const { body: jsonLdBody, cspHash } = jsonLdScript(jsonLd);

  // Ascending combat level — the same order the in-game boss browser lists
  // them in, so the page reads as a natural progression rather than an
  // arbitrary dump.
  const ordered = [...bosses].sort((a, b) => a.combatLevel - b.combatLevel);
  const rows = ordered
    .map((npc, i) => {
      const pet = petByNpcId.get(npc.id);
      const petBit = pet ? `<span class="pet">pet ${formatPetRate(pet.numerator, pet.denominator)}</span>` : "";
      // The wiki serves these icons at full size (often >1500px wide) for a
      // 28px slot, so eagerly fetching all 65 would be a lot of bytes for a
      // page whose speed is itself a ranking signal. Only the rows that are
      // plausibly above the fold load eagerly; the rest stay lazy. Eager also
      // sidesteps lazy-loading never triggering where a page is rendered
      // without a real visible viewport (thumbnailers, some crawlers).
      const eager = i < 12;
      return `<a class="boss-card" href="/bosses/${npc.id}/">
            <span class="thumb"><img src="${npc.iconUrl}" alt="${escapeHtml(npc.name)} drop table" width="28" height="28" loading="${eager ? "eager" : "lazy"}" decoding="async" /></span>
            <span class="meta">
              <span class="name">${escapeHtml(npc.name)}</span>
              <span class="lvl">Combat level ${npc.combatLevel.toLocaleString("en-US")}${petBit ? " · " : ""}${petBit}</span>
            </span>
          </a>`;
    })
    .join("\n          ");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <!--
      Generated by scripts/generate-boss-pages.mjs — do not hand-edit.
      Static, zero-JS index of every per-boss page (see hubHtml() for why this
      page exists at all).
    -->
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self' '${cspHash}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://oldschool.runescape.wiki data:; font-src https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; object-src 'none'"
    />
    <link rel="icon" type="image/png" href="/brand/favicon.png" />
    <link rel="apple-touch-icon" href="/brand/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#3e3529" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://oldschool.runescape.wiki" />
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=Cabin:wght@400;500;600;700&display=swap" rel="stylesheet" />

    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${canonical}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="OSRS Drop Simulator" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${SITE_URL}/brand/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="OSRS Drop Simulator — free browser drop-rate simulator for 65 Old School RuneScape bosses" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${SITE_URL}/brand/og-image.jpg" />

    <script type="application/ld+json">${jsonLdBody}</script>

    <style>
${BASE_CSS}
      main { max-width: 980px; }
      .intro { margin-top: 18px; padding: 26px 28px 24px; }
      h1 { font-family: "Cinzel", serif; font-weight: 900; font-size: clamp(25px, 4vw, 33px); line-height: 1.15; margin: 0 0 10px; text-wrap: balance; }
      .eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--parchment-faint); margin: 0 0 6px; }
      .sub { margin: 0; color: var(--parchment); font-size: 15px; line-height: 1.55; max-width: 68ch; }
      section { margin-top: 20px; padding: 24px 28px 28px; }
      h2 { font-family: "Cinzel", serif; font-weight: 700; font-size: 17px; letter-spacing: 0.02em; text-transform: uppercase; margin: 0 0 4px; }
      .section-note { margin: 0 0 18px; font-size: 13.5px; color: var(--parchment-faint); }
      .boss-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
      .boss-card {
        display: flex; align-items: center; gap: 12px; padding: 11px 13px; border-radius: 10px;
        border: 1px solid var(--border-light); background: rgba(0, 0, 0, 0.2); text-decoration: none;
        transition: border-color 150ms ease, background 150ms ease;
      }
      .boss-card:hover { border-color: var(--border-hair); background: rgba(255, 183, 0, 0.06); }
      .thumb {
        width: 38px; height: 38px; flex-shrink: 0; border-radius: 50%; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 38% 32%, rgba(255,255,255,0.08), rgba(0,0,0,0.3) 70%);
        box-shadow: 0 0 0 1px var(--border-light);
      }
      /* Explicit box, not a max-width percentage: these are loading="lazy",
         and an unloaded image with only percentage caps lays out at 0x0 —
         which the lazy-loading heuristic then reads as "not visible", so it
         never loads and never gains a size. Fixing the box breaks that
         deadlock and keeps layout stable (no shift) while icons stream in. */
      .thumb img { width: 28px; height: 28px; object-fit: contain; }
      .meta { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
      .name { font-size: 14px; font-weight: 600; color: var(--text); }
      .lvl { font-size: 11.5px; color: var(--parchment-faint); font-variant-numeric: tabular-nums; }
      .pet { color: var(--parchment-dim); }
      footer { max-width: 980px; margin: 30px auto 0; padding-block: 18px; text-align: center; font-size: 11.5px; color: rgba(217, 200, 160, 0.4); }
      @media (max-width: 860px) { .boss-grid { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 560px) { .boss-grid { grid-template-columns: 1fr; } section, .intro { padding: 22px 18px 24px; } }
    </style>
  </head>
  <body>
    <header class="site">
      <a class="brand" href="/"><img src="/brand/logo.png" alt="OSRS Drop Simulator" />OSRS Drop Simulator</a>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="/">Home</a> ›
        <span style="color:var(--parchment)">Bosses</span>
      </nav>
    </header>

    <main>
      <div class="panel intro">
        <p class="eyebrow">Boss index</p>
        <h1><span class="gold-leaf">All OSRS Boss Drop Tables</span></h1>
        <p class="sub">Every boss in OSRS Drop Simulator, ordered by combat level. Each one has its real drop table with exact rates, and a free simulator you can roll as many times as you want — no login, straight in your browser.</p>
      </div>

      <section class="panel">
        <h2>${bosses.length} bosses</h2>
        <p class="section-note">From the earliest low-level fights up to end-game bosses and raids.</p>
        <div class="boss-grid">
          ${rows}
        </div>
      </section>
    </main>

    <footer>
      Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy.
      This content is not endorsed by or affiliated with Jagex.
    </footer>
  </body>
</html>
`;
}

/**
 * Reads an existing sitemap.xml (if any) into { loc -> lastmod }. Used so a
 * regenerate that doesn't actually change a URL's content can keep that
 * URL's real last-changed date instead of stamping "today" on all 69 URLs
 * every single run — see the comment on `lastmodFor` for why that matters.
 */
function readOldLastmods(sitemapPath) {
  const map = new Map();
  if (!existsSync(sitemapPath)) return map;
  const xml = readFileSync(sitemapPath, "utf8");
  const urlBlockRe = /<url>([\s\S]*?)<\/url>/g;
  let m;
  while ((m = urlBlockRe.exec(xml))) {
    const loc = m[1].match(/<loc>(.*?)<\/loc>/)?.[1];
    const lastmod = m[1].match(/<lastmod>(.*?)<\/lastmod>/)?.[1];
    if (loc && lastmod) map.set(loc, lastmod);
  }
  return map;
}

/**
 * A sitemap's <lastmod> is a signal Google uses to decide whether a URL is
 * worth re-crawling — but only while it trusts the field. Regenerating every
 * boss page from scratch on every run (after any generate-monsters/
 * update-prices refresh, even ones that touch zero boss data) and stamping
 * `today` on all of them regardless of whether their content actually
 * changed is exactly the pattern Google's own sitemap docs warn produces an
 * untrustworthy signal, which then gets discounted entirely — silently
 * losing whatever re-crawl-scheduling benefit an accurate lastmod would earn
 * the URLs that DID genuinely change. Comparing newly generated HTML against
 * what was already on disk keeps lastmod truthful without hand-tracking
 * per-boss change history.
 */
function lastmodFor(loc, newContent, oldContentByLoc, oldLastmods) {
  const oldContent = oldContentByLoc.get(loc);
  if (oldContent !== undefined && oldContent === newContent) {
    return oldLastmods.get(loc) ?? today;
  }
  return today;
}

function buildSitemap(npcs, oldContentByLoc, oldLastmods, hubContent, bossPageContent) {
  // The 3 hand-authored pages aren't written by this script, so there's no
  // "new content" to diff for them — carry their previous lastmod forward
  // unconditionally (a real edit to one of those files is on whoever makes
  // it to also bump this, same as any hand-maintained metadata).
  const carry = (loc) => oldLastmods.get(loc) ?? today;
  const staticUrls = [
    { loc: `${SITE_URL}/`, lastmod: carry(`${SITE_URL}/`), changefreq: "daily", priority: "1.0" },
    { loc: `${SITE_URL}/faq/`, lastmod: carry(`${SITE_URL}/faq/`), changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE_URL}/pet-drop-sim/`, lastmod: carry(`${SITE_URL}/pet-drop-sim/`), changefreq: "monthly", priority: "0.7" },
    // Above the individual boss pages: it's the hub they all hang off, so it
    // should be crawled before (and more often than) any one of them.
    {
      loc: `${SITE_URL}/bosses/`,
      lastmod: lastmodFor(`${SITE_URL}/bosses/`, hubContent, oldContentByLoc, oldLastmods),
      changefreq: "weekly",
      priority: "0.8",
    },
  ];
  const bossUrls = npcs.map((npc) => {
    const loc = `${SITE_URL}/bosses/${npc.id}/`;
    return {
      loc,
      lastmod: lastmodFor(loc, bossPageContent.get(npc.id), oldContentByLoc, oldLastmods),
      changefreq: "monthly",
      priority: "0.6",
    };
  });
  const all = [...staticUrls, ...bossUrls];
  const body = all
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

async function main() {
  const { mergeNpcs, mergeItems, containers, getPetBosses } = await loadDataModule();
  const generatedMonsters = JSON.parse(readFileSync(path.join(ROOT, "public/data/monsters.json"), "utf8"));
  const generatedItems = JSON.parse(readFileSync(path.join(ROOT, "public/data/items.json"), "utf8"));
  const npcs = mergeNpcs(generatedMonsters);
  const items = mergeItems(generatedItems);
  const bosses = npcs.filter((n) => n.category === "boss");
  const petBosses = getPetBosses(npcs, containers, items);
  const petByNpcId = new Map(petBosses.map((p) => [p.npc.id, p]));

  // Snapshot what's already on disk BEFORE wiping it, so the sitemap can
  // tell which URLs actually changed this run — see lastmodFor().
  const oldContentByLoc = new Map();
  for (const npc of bosses) {
    const p = path.join(BOSSES_DIR, npc.id, "index.html");
    if (existsSync(p)) oldContentByLoc.set(`${SITE_URL}/bosses/${npc.id}/`, readFileSync(p, "utf8"));
  }
  const oldHubPath = path.join(BOSSES_DIR, "index.html");
  if (existsSync(oldHubPath)) oldContentByLoc.set(`${SITE_URL}/bosses/`, readFileSync(oldHubPath, "utf8"));
  const oldLastmods = readOldLastmods(path.join(ROOT, "public/sitemap.xml"));

  if (existsSync(BOSSES_DIR)) rmSync(BOSSES_DIR, { recursive: true });
  mkdirSync(BOSSES_DIR, { recursive: true });

  const bossPageContent = new Map();
  for (const npc of bosses) {
    const dir = path.join(BOSSES_DIR, npc.id);
    mkdirSync(dir, { recursive: true });
    const html = pageHtml(npc, items, bosses, petByNpcId.get(npc.id) ?? null);
    bossPageContent.set(npc.id, html);
    writeFileSync(path.join(dir, "index.html"), html);
  }

  const hubContent = hubHtml(bosses, petByNpcId);
  writeFileSync(path.join(BOSSES_DIR, "index.html"), hubContent);
  writeFileSync(
    path.join(ROOT, "public/sitemap.xml"),
    buildSitemap(bosses, oldContentByLoc, oldLastmods, hubContent, bossPageContent),
  );

  console.log(
    `Generated ${bosses.length} boss pages + the /bosses/ hub in public/bosses/, plus sitemap.xml (${bosses.length + 4} URLs).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
