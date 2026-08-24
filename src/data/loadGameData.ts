import { containers, mergeItems, mergeNpcs, type ContainerDef, type DropItem, type Npc } from "./npcData";

export interface GameData {
  npcs: Npc[];
  items: Record<string, DropItem>;
  containers: Record<string, ContainerDef>;
}

let cached: Promise<GameData> | null = null;

/**
 * Fetches the bulk-generated monster/item dataset (~1.4MB) as separate JSON
 * requests instead of bundling it into the JS — keeps the initial script the
 * browser has to parse small, and lets this load in parallel with everything
 * else. Memoized: only fetches once per page load.
 */
export function loadGameData(): Promise<GameData> {
  if (!cached) {
    const base = import.meta.env.BASE_URL;
    // Cache-busting query param — see vite-env.d.ts's __DATA_BUILD_TIME__
    // comment for why this fixed-URL fetch needs one.
    const v = `?v=${__DATA_BUILD_TIME__}`;
    cached = Promise.all([
      fetch(`${base}data/monsters.json${v}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load monsters.json: ${r.status}`);
        return r.json() as Promise<Npc[]>;
      }),
      fetch(`${base}data/items.json${v}`).then((r) => {
        if (!r.ok) throw new Error(`Failed to load items.json: ${r.status}`);
        return r.json() as Promise<Record<string, DropItem>>;
      }),
    ]).then(([monsters, items]) => ({
      npcs: mergeNpcs(monsters),
      items: mergeItems(items),
      containers,
    }));
  }
  return cached;
}
