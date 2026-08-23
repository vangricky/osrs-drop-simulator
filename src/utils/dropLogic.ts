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

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Simulates a single roll against a loot table (an NPC kill or an openable
 * container like a clue casket).
 * - `always` entries are guaranteed every roll.
 * - `mainTable` yields at most ONE drop per roll (mirrors the real game's
 *   single weighted roll on the main table), checked in random order so no
 *   entry is unfairly favored by list position.
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
    for (const entry of shuffled(table.mainTable)) {
      if (rollChance(entry)) {
        const item = itemsById[entry.itemId];
        if (item) {
          results.push({ item, quantity: randomInRange(entry.minQuantity, entry.maxQuantity), source: "main" });
        }
        break;
      }
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
