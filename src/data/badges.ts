/**
 * Permanent badges. They're awarded only by the server (see
 * public._award_badge in supabase/migrations/20261107000000_server_side_rolls_competitive.sql),
 * never revoked, and they survive prestige. This file is just how each badge
 * id is shown. The RuneLite plugin keeps a matching copy in Badges.java.
 */
export interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Higher shows first next to a player's name. */
  rank: number;
}

const wiki = (name: string) => `https://oldschool.runescape.wiki/images/${name.replace(/ /g, "_")}.png`;

export const BADGES: Record<string, BadgeDef> = {
  "prestige-10": { id: "prestige-10", name: "Prestige X", description: "Prestiged 10 times.", icon: wiki("Infernal max cape"), rank: 100 },
  "prestige-5": { id: "prestige-5", name: "Prestige V", description: "Prestiged 5 times.", icon: wiki("Max cape"), rank: 90 },
  "prestige-3": { id: "prestige-3", name: "Prestige III", description: "Prestiged 3 times.", icon: wiki("Infernal cape"), rank: 80 },
  "prestige-2": { id: "prestige-2", name: "Prestige II", description: "Prestiged twice.", icon: wiki("Fire cape"), rank: 70 },
  "prestige-1": { id: "prestige-1", name: "Prestige I", description: "Unlocked every boss and prestiged.", icon: wiki("Cape of legends"), rank: 60 },
  "weekly-champion": { id: "weekly-champion", name: "Weekly Champion", description: "Finished #1 in a weekly season.", icon: wiki("Champion's cape"), rank: 55 },
  "clog-500": { id: "clog-500", name: "Log Legend", description: "500 collection log slots.", icon: wiki("Collection log"), rank: 50 },
  "clog-250": { id: "clog-250", name: "Log Hunter", description: "250 collection log slots.", icon: wiki("Collection log"), rank: 40 },
  "clog-100": { id: "clog-100", name: "Log Starter", description: "100 collection log slots.", icon: wiki("Collection log"), rank: 30 },
  "pet-hunter": { id: "pet-hunter", name: "Pet Hunter", description: "Got a boss pet.", icon: wiki("Pet rock"), rank: 20 },
  "plugin-pioneer": { id: "plugin-pioneer", name: "RuneLite Pioneer", description: "Linked the RuneLite plugin.", icon: wiki("Ring of wealth"), rank: 10 },
};

export function sortBadges(ids: string[]): BadgeDef[] {
  return ids.flatMap((id) => (BADGES[id] ? [BADGES[id]] : [])).sort((a, b) => b.rank - a.rank);
}

/** One badge per family (highest prestige, highest clog tier), for compact display next to a name. */
export function topBadges(ids: string[], max = 3): BadgeDef[] {
  const seen = new Set<string>();
  const out: BadgeDef[] = [];
  for (const b of sortBadges(ids)) {
    const family = b.id.replace(/-\d+$/, "");
    if (seen.has(family)) continue;
    seen.add(family);
    out.push(b);
    if (out.length >= max) break;
  }
  return out;
}

export function prestigeBadgeFor(count: number): BadgeDef | null {
  return BADGES[`prestige-${count}`] ?? null;
}
