import type { ContainerDef, DropItem, Npc } from "./npcData";
import { rollDrop } from "../utils/dropLogic";
import { PET_ITEM_IDS } from "./pets";

export interface PetBossInfo {
  npc: Npc;
  petItemId: string;
  petName: string;
  petIconUrl: string;
  /** Effective combined rate — for the one boss whose pet isn't a direct
   * drop (Abyssal Sire), this is already the multiplied-through rate. */
  numerator: number;
  denominator: number;
}

/**
 * Every boss with an obtainable pet, derived from the actual drop tables
 * rather than a hand-maintained parallel list — stays correct automatically
 * if a boss's table changes. Abyssal Sire is a special case: its pet isn't a
 * direct drop at all, just "Unsired" (1/100), which then has to be converted
 * at the Font of Consumption (5/128) for a chance at the actual pet — this
 * combines both steps into one effective rate so it can be treated like
 * every other boss's flat pet chance.
 */
export function getPetBosses(npcs: Npc[], containers: Record<string, ContainerDef>, items: Record<string, DropItem>): PetBossInfo[] {
  const out: PetBossInfo[] = [];

  for (const npc of npcs) {
    if (npc.id === "abyssal-sire") {
      const unsiredEntry = npc.mainTable.find((e) => e.itemId === "unsired");
      const orphanEntry = containers.unsired?.mainTable.find((e) => e.itemId === "abyssal-orphan");
      const petItem = items["abyssal-orphan"];
      if (unsiredEntry && orphanEntry && petItem) {
        out.push({
          npc,
          petItemId: "abyssal-orphan",
          petName: petItem.name,
          petIconUrl: petItem.iconUrl,
          numerator: unsiredEntry.numerator * orphanEntry.numerator,
          denominator: unsiredEntry.denominator * orphanEntry.denominator,
        });
      }
      continue;
    }

    const petEntry = [...npc.always, ...npc.mainTable, ...npc.tertiary].find((e) => PET_ITEM_IDS.has(e.itemId));
    if (!petEntry) continue;
    const petItem = items[petEntry.itemId];
    if (!petItem) continue;
    out.push({
      npc,
      petItemId: petEntry.itemId,
      petName: petItem.name,
      petIconUrl: petItem.iconUrl,
      numerator: petEntry.numerator,
      denominator: petEntry.denominator,
    });
  }

  return out;
}

/** Simulates one kill against `info.npc` and reports whether it produced the
 * pet — reuses the real rollDrop engine (same math as the main game) rather
 * than a separate probability calculation, so this simulator can't drift
 * from the actual drop tables. Abyssal Sire's Unsired->Font conversion is
 * resolved in the same tick, matching how a player would use it immediately
 * while hunting the pet. */
export function rollForPet(info: PetBossInfo, items: Record<string, DropItem>, containers: Record<string, ContainerDef>): boolean {
  const drops = rollDrop(info.npc, items);
  for (const d of drops) {
    if (d.item.id === info.petItemId) return true;
    if (info.npc.id === "abyssal-sire" && d.item.id === "unsired") {
      const container = containers.unsired;
      if (container && rollDrop(container, items).some((cd) => cd.item.id === "abyssal-orphan")) return true;
    }
  }
  return false;
}
