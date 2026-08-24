import type { DropEntry, DropItem, LootTable } from "../data/npcData";

export interface RolledDrop {
  item: DropItem;
  quantity: number;
  source: "always" | "main" | "tertiary";
}

function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function rollChance(entry: DropEntry): boolean {
  return Math.random() < entry.numerator / entry.denominator;
}

/** Picks exactly one entry from `entries`, weighted by each entry's own
 * probability (numerator/denominator) relative to the others — the real
 * game's "single roll on the main drop table" mechanic, where the table is
 * guaranteed to produce something as long as it isn't empty. Weights are
 * normalized against their own sum rather than assumed to already total 1,
 * so this stays a true single guaranteed pick even when the source data's
 * individual rates don't add up to exactly 100% (a few discarded/unparsed
 * rows, rounding, etc.) — every entry still gets picked in the same
 * relative proportion to the others. */
function pickWeighted<T extends DropEntry>(entries: T[]): T | null {
  if (entries.length === 0) return null;
  const weights = entries.map((e) => e.numerator / e.denominator);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i];
    if (r <= 0) return entries[i];
  }
  return entries[entries.length - 1];
}

/**
 * Simulates a single roll against a loot table (an NPC kill or an openable
 * container like a clue casket).
 * - `always` entries are guaranteed every roll.
 * - `mainTable` yields exactly ONE drop per roll, chosen by a single
 *   weighted pick across the whole table (mirrors the real game's main
 *   drop table — you always get something from it, never "nothing", the
 *   weighting just decides which item). Repeated `mainRolls` times for
 *   bosses whose real table is rolled more than once per kill.
 * - `tertiary` entries (clue scrolls, pets, rare uniques) roll independently
 *   and can stack with each other and with a main-table hit.
 */
export function rollDrop(table: LootTable, itemsById: Record<string, DropItem>): RolledDrop[] {
  const results: RolledDrop[] = [];

  for (const entry of table.always) {
    const item = itemsById[entry.itemId];
    if (!item) continue;
    results.push({ item, quantity: randomInRange(entry.minQuantity, entry.maxQuantity), source: "always" });
  }

  for (let roll = 0; roll < (table.mainRolls ?? 1); roll++) {
    const entry = pickWeighted(table.mainTable);
    if (!entry) continue;
    const item = itemsById[entry.itemId];
    if (item) {
      results.push({ item, quantity: randomInRange(entry.minQuantity, entry.maxQuantity), source: "main" });
    }
  }

  for (const entry of table.tertiary) {
    if (rollChance(entry)) {
      const item = itemsById[entry.itemId];
      if (item) {
        results.push({ item, quantity: randomInRange(entry.minQuantity, entry.maxQuantity), source: "tertiary" });
      }
    }
  }

  return results;
}

export type RarityTier = "always" | "common" | "uncommon" | "rare" | "veryrare";

export function rarityTier(entry: DropEntry): RarityTier {
  const p = entry.numerator / entry.denominator;
  if (p >= 1) return "always";
  if (p >= 1 / 12) return "common";
  if (p >= 1 / 127) return "uncommon";
  if (p >= 1 / 1000) return "rare";
  return "veryrare";
}

export const RARITY_STYLES: Record<RarityTier, { text: string; ring: string; label: string }> = {
  always: { text: "text-slate-300", ring: "ring-slate-400", label: "Always" },
  common: { text: "text-osrs-green", ring: "ring-osrs-green", label: "Common" },
  uncommon: { text: "text-osrs-blue", ring: "ring-osrs-blue", label: "Uncommon" },
  rare: { text: "text-purple-400", ring: "ring-purple-400", label: "Rare" },
  veryrare: { text: "text-osrs-orange", ring: "ring-osrs-orange", label: "Very rare" },
};

export function formatDropRate(entry: DropEntry): string {
  if (entry.numerator === 1) return `1/${entry.denominator.toLocaleString()}`;
  return `${entry.numerator}/${entry.denominator.toLocaleString()}`;
}

export function isStackable(item: DropItem, noted?: boolean): boolean {
  if (noted) return true;
  return item.stackable;
}

/** OSRS-style compact GP formatting, e.g. 1234 -> "1.2K", 15000000 -> "15M". */
export function formatGp(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(amount % 1_000_000_000 === 0 ? 0 : 1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}M`;
  if (amount >= 100_000) return `${Math.floor(amount / 1000)}K`;
  return amount.toLocaleString();
}
