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
]);

export function isRealRepeatableBoss(name) {
  return !RAID_ROOM_BOSSES.has(name) && !KNOWN_ONE_OFF_BOSSES.has(name);
}
