import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { containers, items as allItems, npcs, type Npc } from "../data/npcData";
import { isStackable, rollDrop, type RolledDrop } from "../utils/dropLogic";

export const INVENTORY_SIZE = 28;

export interface InventorySlot {
  itemId: string;
  quantity: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  npcId: string;
  npcName: string;
  drops: { itemId: string; quantity: number; source: RolledDrop["source"] }[];
}

interface PersistedState {
  inventory: (InventorySlot | null)[];
  log: LogEntry[];
  killCounts: Record<string, number>;
  collectionLog: Record<string, number>;
  gp: number;
  unlockedNpcIds: string[];
}

const STORAGE_KEY = "osrs-drop-sim-state-v2";
const MAX_LOG_ENTRIES = 150;

function starterUnlockedIds(): string[] {
  return npcs.filter((n) => n.unlockCost === 0).map((n) => n.id);
}

function emptyInventory(): (InventorySlot | null)[] {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

function freshState(): PersistedState {
  return {
    inventory: emptyInventory(),
    log: [],
    killCounts: {},
    collectionLog: {},
    gp: 0,
    unlockedNpcIds: starterUnlockedIds(),
  };
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("no state");
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.inventory) || parsed.inventory.length !== INVENTORY_SIZE) {
      throw new Error("bad shape");
    }
    return {
      ...freshState(),
      ...parsed,
      unlockedNpcIds: Array.from(new Set([...starterUnlockedIds(), ...(parsed.unlockedNpcIds ?? [])])),
    };
  } catch {
    return freshState();
  }
}

function addDropsToInventory(
  inventory: (InventorySlot | null)[],
  drops: RolledDrop[],
): { inventory: (InventorySlot | null)[]; overflow: RolledDrop[] } {
  const next = [...inventory];
  const overflow: RolledDrop[] = [];

  const firstEmptySlot = () => next.findIndex((slot) => slot === null);

  for (const drop of drops) {
    let remaining = drop.quantity;
    const stackable = isStackable(drop.item);

    if (stackable) {
      const existingIndex = next.findIndex((slot) => slot?.itemId === drop.item.id);
      if (existingIndex !== -1) {
        const slot = next[existingIndex]!;
        next[existingIndex] = { ...slot, quantity: slot.quantity + remaining };
        remaining = 0;
      } else {
        const slotIndex = firstEmptySlot();
        if (slotIndex === -1) {
          overflow.push({ ...drop, quantity: remaining });
          remaining = 0;
        } else {
          next[slotIndex] = { itemId: drop.item.id, quantity: remaining };
          remaining = 0;
        }
      }
    } else {
      while (remaining > 0) {
        const slotIndex = firstEmptySlot();
        if (slotIndex === -1) {
          overflow.push({ ...drop, quantity: remaining });
          remaining = 0;
          break;
        }
        next[slotIndex] = { itemId: drop.item.id, quantity: 1 };
        remaining -= 1;
      }
    }
  }

  return { inventory: next, overflow };
}

export interface KillResult {
  drops: RolledDrop[];
  overflow: RolledDrop[];
}

export interface ContainerOpenResult extends KillResult {
  containerName: string;
}

export function useGameState() {
  const [state, setState] = useState<PersistedState>(loadState);
  const [lastKill, setLastKill] = useState<KillResult | null>(null);
  const [lastContainerOpen, setLastContainerOpen] = useState<ContainerOpenResult | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const simulateKill = useCallback((npc: Npc): KillResult => {
    const drops = rollDrop(npc, allItems);
    // Coin drops go straight to the GP balance rather than taking an inventory slot.
    const coinDrops = drops.filter((d) => d.item.id === "coins");
    const itemDrops = drops.filter((d) => d.item.id !== "coins");
    const coinsGained = coinDrops.reduce((sum, d) => sum + d.quantity, 0);
    let overflow: RolledDrop[] = [];

    setState((prev) => {
      const { inventory, overflow: ov } = addDropsToInventory(prev.inventory, itemDrops);
      overflow = ov;

      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        npcId: npc.id,
        npcName: npc.name,
        drops: drops.map((d) => ({ itemId: d.item.id, quantity: d.quantity, source: d.source })),
      };

      const collectionLog = { ...prev.collectionLog };
      for (const d of drops) {
        collectionLog[d.item.id] = (collectionLog[d.item.id] ?? 0) + d.quantity;
      }

      return {
        ...prev,
        inventory,
        gp: prev.gp + coinsGained,
        log: [logEntry, ...prev.log].slice(0, MAX_LOG_ENTRIES),
        killCounts: { ...prev.killCounts, [npc.id]: (prev.killCounts[npc.id] ?? 0) + 1 },
        collectionLog,
      };
    });

    const result: KillResult = { drops, overflow };
    setLastKill(result);
    return result;
  }, []);

  const openContainer = useCallback((index: number): ContainerOpenResult | null => {
    const slot0 = stateRef.current.inventory[index];
    if (!slot0) return null;
    const container = containers[slot0.itemId];
    if (!container) return null;

    const drops = rollDrop(container, allItems);
    const coinDrops = drops.filter((d) => d.item.id === "coins");
    const itemDrops = drops.filter((d) => d.item.id !== "coins");
    const coinsGained = coinDrops.reduce((sum, d) => sum + d.quantity, 0);
    let overflow: RolledDrop[] = [];

    setState((prev) => {
      const slot = prev.inventory[index];
      if (!slot || slot.itemId !== container.itemId) return prev;

      const consumedInventory = [...prev.inventory];
      consumedInventory[index] = slot.quantity > 1 ? { ...slot, quantity: slot.quantity - 1 } : null;

      const { inventory, overflow: ov } = addDropsToInventory(consumedInventory, itemDrops);
      overflow = ov;

      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        npcId: container.itemId,
        npcName: container.name,
        drops: drops.map((d) => ({ itemId: d.item.id, quantity: d.quantity, source: d.source })),
      };

      const collectionLog = { ...prev.collectionLog };
      for (const d of drops) {
        collectionLog[d.item.id] = (collectionLog[d.item.id] ?? 0) + d.quantity;
      }

      return {
        ...prev,
        inventory,
        gp: prev.gp + coinsGained,
        log: [logEntry, ...prev.log].slice(0, MAX_LOG_ENTRIES),
        collectionLog,
      };
    });

    const result: ContainerOpenResult = { drops, overflow, containerName: container.name };
    setLastContainerOpen(result);
    return result;
  }, []);

  const moveItem = useCallback((from: number, to: number) => {
    setState((prev) => {
      if (from === to) return prev;
      const next = [...prev.inventory];
      [next[from], next[to]] = [next[to], next[from]];
      return { ...prev, inventory: next };
    });
  }, []);

  const removeItem = useCallback((index: number) => {
    setState((prev) => {
      const next = [...prev.inventory];
      next[index] = null;
      return { ...prev, inventory: next };
    });
  }, []);

  const clearInventory = useCallback(() => {
    setState((prev) => ({ ...prev, inventory: emptyInventory() }));
  }, []);

  const sellItem = useCallback((index: number) => {
    setState((prev) => {
      const slot = prev.inventory[index];
      if (!slot) return prev;
      const item = allItems[slot.itemId];
      if (!item || !item.tradeable) return prev;
      const next = [...prev.inventory];
      next[index] = null;
      return { ...prev, inventory: next, gp: prev.gp + item.value * slot.quantity };
    });
  }, []);

  const sellAll = useCallback(() => {
    setState((prev) => {
      let gained = 0;
      const next = prev.inventory.map((slot) => {
        if (!slot) return slot;
        const item = allItems[slot.itemId];
        if (!item || !item.tradeable) return slot;
        gained += item.value * slot.quantity;
        return null;
      });
      if (gained === 0) return prev;
      return { ...prev, inventory: next, gp: prev.gp + gained };
    });
  }, []);

  const unlockNpc = useCallback((npc: Npc): boolean => {
    let success = false;
    setState((prev) => {
      if (prev.unlockedNpcIds.includes(npc.id)) return prev;
      if (prev.gp < npc.unlockCost) return prev;
      success = true;
      return { ...prev, gp: prev.gp - npc.unlockCost, unlockedNpcIds: [...prev.unlockedNpcIds, npc.id] };
    });
    return success;
  }, []);

  const resetAll = useCallback(() => {
    setState(freshState());
    setLastKill(null);
    setLastContainerOpen(null);
  }, []);

  const closeContainerModal = useCallback(() => setLastContainerOpen(null), []);

  const totalKills = useMemo(
    () => Object.values(state.killCounts).reduce((a, b) => a + b, 0),
    [state.killCounts],
  );

  const uniqueItemsObtained = useMemo(() => Object.keys(state.collectionLog).length, [state.collectionLog]);

  const unlockedNpcIds = useMemo(() => new Set(state.unlockedNpcIds), [state.unlockedNpcIds]);

  return {
    inventory: state.inventory,
    log: state.log,
    killCounts: state.killCounts,
    collectionLog: state.collectionLog,
    gp: state.gp,
    unlockedNpcIds,
    totalKills,
    uniqueItemsObtained,
    lastKill,
    lastContainerOpen,
    simulateKill,
    openContainer,
    closeContainerModal,
    moveItem,
    removeItem,
    clearInventory,
    sellItem,
    sellAll,
    unlockNpc,
    resetAll,
  };
}
