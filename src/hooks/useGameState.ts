import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGameData } from "../hooks/useGameData";
import type { DropItem, Npc } from "../data/npcData";
import { supabase } from "../lib/supabase";
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
  sourceType: "kill" | "container";
  // Which numbered kill/open of that source this entry was (e.g. this was
  // Brutus kill #47) — same "first obtained" bookkeeping the collection log
  // already tracks per item, just recorded on every entry instead of only
  // the first.
  sourceCount: number;
  drops: { itemId: string; quantity: number; source: RolledDrop["source"] }[];
}

/** Records the first time an item was obtained: what dropped it, and which
 * numbered kill/open of that source produced it (e.g. "kill #47 of Zulrah"). */
export interface CollectionLogFirst {
  itemId: string;
  sourceType: "kill" | "container";
  sourceId: string;
  sourceName: string;
  sourceCount: number;
  timestamp: number;
}

interface PersistedState {
  inventory: (InventorySlot | null)[];
  log: LogEntry[];
  killCounts: Record<string, number>;
  containerOpenCounts: Record<string, number>;
  collectionLog: Record<string, number>;
  collectionLogFirsts: Record<string, CollectionLogFirst>;
  gp: number;
  unlockedNpcIds: string[];
  prestigeCount: number;
}

const STORAGE_KEY = "osrs-drop-sim-state-v2";
const MAX_LOG_ENTRIES = 150;

// Signed-in players start with just the free-tier (unlockCost === 0) bosses
// and grind GP to unlock the rest, same as any other unlock. Guests get
// every boss unlocked immediately instead (see allNpcIds below) — no
// account, no stakes, so no reason to gate anything; they're just here to
// mess around.
function starterUnlockedIds(npcs: Npc[]): string[] {
  return npcs.filter((n) => n.unlockCost === 0).map((n) => n.id);
}

function allNpcIds(npcs: Npc[]): string[] {
  return npcs.map((n) => n.id);
}

function emptyInventory(): (InventorySlot | null)[] {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

// A fresh board, but `prestigeCount` is passed in separately by callers —
// it's the one thing prestiging is supposed to NOT wipe. Only ever used for
// the guest path (loadCloudState is the signed-in equivalent), so
// unlockedNpcIds is always "everything", matching the guest philosophy.
function freshState(npcs: Npc[], prestigeCount = 0): PersistedState {
  return {
    inventory: emptyInventory(),
    log: [],
    killCounts: {},
    containerOpenCounts: {},
    collectionLog: {},
    collectionLogFirsts: {},
    gp: 0,
    unlockedNpcIds: allNpcIds(npcs),
    prestigeCount,
  };
}

function loadState(npcs: Npc[]): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("no state");
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.inventory) || parsed.inventory.length !== INVENTORY_SIZE) {
      throw new Error("bad shape");
    }
    return {
      ...freshState(npcs),
      ...parsed,
      // Always everything, regardless of what was saved before — a guest
      // save made back when the roster was unlock-cost-gated shouldn't stay
      // partially locked forever.
      unlockedNpcIds: allNpcIds(npcs),
      prestigeCount: parsed.prestigeCount ?? 0,
      containerOpenCounts: parsed.containerOpenCounts ?? {},
      collectionLogFirsts: parsed.collectionLogFirsts ?? {},
    };
  } catch {
    return freshState(npcs);
  }
}

/** Arranges a server item-quantity ledger into a display-only 28-slot grid (stackables get one slot, non-stackables one-per-unit, extras beyond 28 slots are simply not shown). */
function inventoryFromLedger(ledger: Record<string, number>, items: Record<string, DropItem>): (InventorySlot | null)[] {
  const next = emptyInventory();
  const firstEmptySlot = () => next.findIndex((slot) => slot === null);

  for (const [itemId, quantity] of Object.entries(ledger)) {
    if (quantity <= 0) continue;
    const item = items[itemId];
    if (!item) continue;
    if (isStackable(item)) {
      const slotIndex = firstEmptySlot();
      if (slotIndex !== -1) next[slotIndex] = { itemId, quantity };
    } else {
      for (let i = 0; i < quantity; i++) {
        const slotIndex = firstEmptySlot();
        if (slotIndex === -1) break;
        next[slotIndex] = { itemId, quantity: 1 };
      }
    }
  }
  return next;
}

/** Tops up a cached display arrangement with anything the ledger says is
 * owned but the cache doesn't show — never removes/shrinks what's already
 * displayed, only adds the shortfall into existing stacks or empty slots.
 * Needed because the cache can under-represent true ownership (e.g. an
 * optimistic "sold"/"moved" that got cached before its RPC actually landed,
 * or in the past, before that class of bug was fixed) — without this,
 * those items become permanently invisible and unsellable despite still
 * being genuinely owned. */
function reconcileInventoryWithLedger(
  cached: (InventorySlot | null)[],
  ledger: Record<string, number>,
  items: Record<string, DropItem>,
): (InventorySlot | null)[] {
  const shown: Record<string, number> = {};
  for (const slot of cached) {
    if (!slot) continue;
    shown[slot.itemId] = (shown[slot.itemId] ?? 0) + slot.quantity;
  }

  const next = [...cached];
  const firstEmptySlot = () => next.findIndex((slot) => slot === null);

  for (const [itemId, ownedQuantity] of Object.entries(ledger)) {
    const missing = ownedQuantity - (shown[itemId] ?? 0);
    if (missing <= 0) continue;
    const item = items[itemId];
    if (!item) continue;

    if (isStackable(item)) {
      const existingIndex = next.findIndex((slot) => slot?.itemId === itemId);
      if (existingIndex !== -1) {
        next[existingIndex] = { ...next[existingIndex]!, quantity: next[existingIndex]!.quantity + missing };
      } else {
        const slotIndex = firstEmptySlot();
        if (slotIndex !== -1) next[slotIndex] = { itemId, quantity: missing };
      }
    } else {
      for (let i = 0; i < missing; i++) {
        const slotIndex = firstEmptySlot();
        if (slotIndex === -1) break;
        next[slotIndex] = { itemId, quantity: 1 };
      }
    }
  }
  return next;
}

async function loadCloudState(userId: string, npcs: Npc[], items: Record<string, DropItem>): Promise<PersistedState | null> {
  if (!supabase) return null;
  const [{ data: gs }, { data: userItems }] = await Promise.all([
    supabase.from("game_state").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("user_items").select("item_id, quantity").eq("user_id", userId),
  ]);
  if (!gs) return null;

  const ledger: Record<string, number> = {};
  for (const row of userItems ?? []) ledger[row.item_id] = row.quantity;

  const cachedInventory = Array.isArray(gs.inventory_cache) ? (gs.inventory_cache as (InventorySlot | null)[]) : [];
  const inventory =
    cachedInventory.length === INVENTORY_SIZE
      ? reconcileInventoryWithLedger(cachedInventory, ledger, items)
      : inventoryFromLedger(ledger, items);

  return {
    inventory,
    log: [],
    killCounts: (gs.kill_counts as Record<string, number>) ?? {},
    containerOpenCounts: (gs.container_open_counts as Record<string, number>) ?? {},
    collectionLog: (gs.collection_log as Record<string, number>) ?? {},
    collectionLogFirsts: (gs.collection_log_firsts as Record<string, CollectionLogFirst>) ?? {},
    gp: Number(gs.gp),
    unlockedNpcIds: (gs.unlocked_npc_ids as string[]) ?? starterUnlockedIds(npcs),
    prestigeCount: Number(gs.prestige_count ?? 0),
  };
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
    const stackable = isStackable(drop.item, drop.noted);

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

// Slightly above the server's own anti-cheat cooldown between minting
// actions (see check_and_touch_mint_cooldown in
// supabase/migrations/0004_security_hardening.sql, 200ms). Calling
// record_kill/open_container faster than that gets silently rejected
// server-side ("too many requests") while the client had already credited
// gp locally — the gp shown would then only revert once a reload re-fetched
// the (lower) authoritative cloud value. Serializing every cloud mutation
// through one queue with this minimum spacing keeps normal clicking from
// ever outrunning what the server will actually accept.
const MIN_MUTATION_GAP_MS = 220;

export function useGameState(userId: string | null = null) {
  const { npcs, items: allItems, containers } = useGameData();
  const [state, setState] = useState<PersistedState>(() => loadState(npcs));
  // Not rendered anywhere — only read inside the sync effect below, so a
  // ref avoids an extra render pass instead of using React state for it.
  const cloudLoadedRef = useRef(false);
  const [lastKill, setLastKill] = useState<KillResult | null>(null);
  const [lastContainerOpen, setLastContainerOpen] = useState<ContainerOpenResult | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const mutationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastMutationAtRef = useRef(0);
  // Runs `run` after every previously-queued cloud mutation has settled, at
  // least MIN_MUTATION_GAP_MS after the previous one started. If it comes
  // back with an error (rejected by the server) or throws (network failure),
  // `onRejected` undoes the matching optimistic local update so the UI never
  // keeps showing gp the server didn't actually accept.
  const enqueueCloudMutation = useCallback(
    (run: () => PromiseLike<{ error: unknown }>, onRejected?: () => void) => {
      mutationQueueRef.current = mutationQueueRef.current.then(async () => {
        const wait = lastMutationAtRef.current + MIN_MUTATION_GAP_MS - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastMutationAtRef.current = Date.now();
        try {
          const { error } = await run();
          if (error) {
            console.error("cloud sync rejected, rolling back", error);
            onRejected?.();
          }
        } catch (error) {
          console.error("cloud sync failed, rolling back", error);
          onRejected?.();
        }
      });
    },
    [],
  );

  // Guest progress lives in localStorage (already the initial state). Signed-in
  // progress lives in Supabase; switching accounts (or signing out) swaps
  // which one `state` reflects. `state` already starts as guest data from
  // useState's initializer, so this only needs to act on actual transitions.
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    const isInitialMount = prevUserIdRef.current === userId && !userId;
    prevUserIdRef.current = userId;
    if (!userId) {
      // No need to reset cloudLoaded here: the inventory-sync effect below
      // already bails out on `!userId` regardless of cloudLoaded's value.
      if (!isInitialMount) setState(loadState(npcs));
      return;
    }
    cloudLoadedRef.current = false;
    let cancelled = false;
    loadCloudState(userId, npcs, allItems).then((cloud) => {
      if (cancelled || !cloud) return;
      cloudLoadedRef.current = true;
      setState(cloud);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, npcs, allItems]);

  // Live cross-tab/cross-device sync: without this, a second tab or device
  // signed into the same account only ever saw this account's gp/kills/etc
  // as of whatever it last loaded — no matter how long it sat open, or how
  // much changed elsewhere in the meantime. Supabase Realtime pushes the
  // updated row the moment any of the RPCs above commit it, so every open
  // tab/device converges on the same authoritative numbers immediately
  // instead of only finding out on their next reload.
  useEffect(() => {
    if (!userId || !supabase) return;
    const channel = supabase
      .channel(`game_state_${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_state", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setState((prev) => ({
            ...prev,
            gp: Number(row.gp),
            killCounts: (row.kill_counts as Record<string, number>) ?? prev.killCounts,
            containerOpenCounts: (row.container_open_counts as Record<string, number>) ?? prev.containerOpenCounts,
            collectionLog: (row.collection_log as Record<string, number>) ?? prev.collectionLog,
            collectionLogFirsts: (row.collection_log_firsts as Record<string, CollectionLogFirst>) ?? prev.collectionLogFirsts,
            unlockedNpcIds: (row.unlocked_npc_ids as string[]) ?? prev.unlockedNpcIds,
            prestigeCount: Number(row.prestige_count ?? prev.prestigeCount),
          }));
        },
      )
      .subscribe();
    return () => {
      supabase!.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (userId) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, userId]);

  // Debounced cloud save of the inventory grid's visual arrangement (display
  // only — gp/items/unlocks are already authoritative via the RPCs below).
  useEffect(() => {
    if (!userId || !cloudLoadedRef.current || !supabase) return;
    const timer = setTimeout(() => {
      supabase!.rpc("sync_inventory_cache", { p_inventory: state.inventory }).then(({ error }) => {
        if (error) console.error("inventory sync failed", error);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [state.inventory, userId]);

  // Debounced cloud save of the collection log's "first obtained" records —
  // informational only, same trust model as the inventory cache above.
  useEffect(() => {
    if (!userId || !cloudLoadedRef.current || !supabase) return;
    const timer = setTimeout(() => {
      supabase!.rpc("sync_collection_log_firsts", { p_data: state.collectionLogFirsts }).then(({ error }) => {
        if (error) console.error("collection log sync failed", error);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [state.collectionLogFirsts, userId]);

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

      const killNumber = (prev.killCounts[npc.id] ?? 0) + 1;
      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        npcId: npc.id,
        npcName: npc.name,
        sourceType: "kill",
        sourceCount: killNumber,
        drops: drops.map((d) => ({ itemId: d.item.id, quantity: d.quantity, source: d.source })),
      };

      const collectionLog = { ...prev.collectionLog };
      const collectionLogFirsts = { ...prev.collectionLogFirsts };
      for (const d of drops) {
        const isFirst = !(d.item.id in collectionLog);
        collectionLog[d.item.id] = (collectionLog[d.item.id] ?? 0) + d.quantity;
        // Coins aren't a collectible (they go straight to gp, same as the
        // real game's collection log not listing plain coin drops).
        if (isFirst && d.item.id !== "coins") {
          collectionLogFirsts[d.item.id] = {
            itemId: d.item.id,
            sourceType: "kill",
            sourceId: npc.id,
            sourceName: npc.name,
            sourceCount: killNumber,
            timestamp: Date.now(),
          };
        }
      }

      return {
        ...prev,
        inventory,
        gp: prev.gp + coinsGained,
        log: [logEntry, ...prev.log].slice(0, MAX_LOG_ENTRIES),
        killCounts: { ...prev.killCounts, [npc.id]: killNumber },
        collectionLog,
        collectionLogFirsts,
      };
    });

    if (userId && supabase) {
      enqueueCloudMutation(
        () =>
          supabase!.rpc("record_kill", {
            p_npc_id: npc.id,
            p_gp_gained: coinsGained,
            p_items: itemDrops.map((d) => ({ item_id: d.item.id, quantity: d.quantity })),
          }),
        () => {
          setState((prev) => ({
            ...prev,
            gp: prev.gp - coinsGained,
            killCounts: { ...prev.killCounts, [npc.id]: Math.max(0, (prev.killCounts[npc.id] ?? 1) - 1) },
          }));
        },
      );
    }

    const result: KillResult = { drops, overflow };
    setLastKill(result);
    return result;
  }, [userId, allItems, enqueueCloudMutation]);

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

      const openNumber = (prev.containerOpenCounts[container.itemId] ?? 0) + 1;
      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        npcId: container.itemId,
        npcName: container.name,
        sourceType: "container",
        sourceCount: openNumber,
        drops: drops.map((d) => ({ itemId: d.item.id, quantity: d.quantity, source: d.source })),
      };

      const collectionLog = { ...prev.collectionLog };
      const collectionLogFirsts = { ...prev.collectionLogFirsts };
      for (const d of drops) {
        const isFirst = !(d.item.id in collectionLog);
        collectionLog[d.item.id] = (collectionLog[d.item.id] ?? 0) + d.quantity;
        if (isFirst && d.item.id !== "coins") {
          collectionLogFirsts[d.item.id] = {
            itemId: d.item.id,
            sourceType: "container",
            sourceId: container.itemId,
            sourceName: container.name,
            sourceCount: openNumber,
            timestamp: Date.now(),
          };
        }
      }

      return {
        ...prev,
        inventory,
        gp: prev.gp + coinsGained,
        log: [logEntry, ...prev.log].slice(0, MAX_LOG_ENTRIES),
        containerOpenCounts: { ...prev.containerOpenCounts, [container.itemId]: openNumber },
        collectionLog,
        collectionLogFirsts,
      };
    });

    if (userId && supabase) {
      enqueueCloudMutation(
        () =>
          supabase!.rpc("open_container", {
            p_container_item_id: container.itemId,
            p_gp_gained: coinsGained,
            p_items: itemDrops.map((d) => ({ item_id: d.item.id, quantity: d.quantity })),
          }),
        () => {
          setState((prev) => ({
            ...prev,
            gp: prev.gp - coinsGained,
            containerOpenCounts: {
              ...prev.containerOpenCounts,
              [container.itemId]: Math.max(0, (prev.containerOpenCounts[container.itemId] ?? 1) - 1),
            },
          }));
        },
      );
    }

    const result: ContainerOpenResult = { drops, overflow, containerName: container.name };
    setLastContainerOpen(result);
    return result;
  }, [userId, allItems, containers, enqueueCloudMutation]);

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
    const slot = stateRef.current.inventory[index];
    const item = slot ? allItems[slot.itemId] : null;
    const gained = slot && item ? item.value * slot.quantity : 0;

    setState((prev) => {
      const slot = prev.inventory[index];
      if (!slot) return prev;
      const item = allItems[slot.itemId];
      if (!item || !item.tradeable) return prev;
      const next = [...prev.inventory];
      next[index] = null;
      return { ...prev, inventory: next, gp: prev.gp + item.value * slot.quantity };
    });
    if (userId && supabase && slot && item?.tradeable) {
      enqueueCloudMutation(
        () => supabase!.rpc("sell_item", { p_item_id: slot.itemId, p_quantity: slot.quantity }),
        () => setState((prev) => ({ ...prev, gp: prev.gp - gained })),
      );
    }
  }, [userId, allItems, enqueueCloudMutation]);

  const sellAll = useCallback(() => {
    // Computed from stateRef (up to date as of last render) before calling
    // setState, not from a variable mutated inside the updater and read
    // right after — setState's updater doesn't necessarily run
    // synchronously (see prestige's guest path below for the same
    // hazard), so that outer variable could still read its initial value
    // here, making the "did anything actually sell" check below false even
    // though the optimistic update a moment later shows it succeeding.
    // That's exactly what was happening: the RPC below never fired for
    // signed-in players, so nothing ever actually got sold server-side —
    // the gp gain was purely local and vanished once anything re-synced
    // from the cloud.
    const gained = stateRef.current.inventory.reduce((sum, slot) => {
      if (!slot) return sum;
      const item = allItems[slot.itemId];
      if (!item?.tradeable) return sum;
      return sum + item.value * slot.quantity;
    }, 0);
    if (gained === 0) return;
    setState((prev) => {
      const next = prev.inventory.map((slot) => {
        if (!slot) return slot;
        const item = allItems[slot.itemId];
        return item?.tradeable ? null : slot;
      });
      return { ...prev, inventory: next, gp: prev.gp + gained };
    });
    if (userId && supabase) {
      enqueueCloudMutation(
        () => supabase!.rpc("sell_all_items"),
        () => setState((prev) => ({ ...prev, gp: prev.gp - gained })),
      );
    }
  }, [userId, allItems, enqueueCloudMutation]);

  const unlockNpc = useCallback((npc: Npc): boolean => {
    // Same stateRef-before-setState pattern as sellAll above, for the same
    // reason: `success` read immediately after setState (rather than from
    // stateRef beforehand) was stale more often than not, so the unlock_npc
    // RPC below almost never actually fired for signed-in players.
    const prev = stateRef.current;
    if (prev.unlockedNpcIds.includes(npc.id)) return false;
    if (prev.gp < npc.unlockCost) return false;
    setState((p) => {
      if (p.unlockedNpcIds.includes(npc.id) || p.gp < npc.unlockCost) return p;
      return { ...p, gp: p.gp - npc.unlockCost, unlockedNpcIds: [...p.unlockedNpcIds, npc.id] };
    });
    if (userId && supabase) {
      enqueueCloudMutation(
        () => supabase!.rpc("unlock_npc", { p_npc_id: npc.id }),
        () => {
          setState((p) => ({
            ...p,
            gp: p.gp + npc.unlockCost,
            unlockedNpcIds: p.unlockedNpcIds.filter((id) => id !== npc.id),
          }));
        },
      );
    }
    return true;
  }, [userId, enqueueCloudMutation]);

  // Requires every monster (bosses included) to be unlocked at once — checked
  // against the CURRENT npc list rather than a stored count, so it stays
  // correct if the roster ever changes size after someone's already unlocked
  // everything that existed at the time.
  const prestige = useCallback(async (): Promise<number | null> => {
    const allUnlocked =
      npcs.length > 0 &&
      npcs.every((n) => n.unlockCost === 0 || stateRef.current.unlockedNpcIds.includes(n.id));
    if (!allUnlocked) return null;

    if (!userId) {
      // Read the pre-update count directly off the ref rather than out of
      // the setState updater: a setState earlier in the same click handler
      // (closing the confirm modal) can cost the updater its usual
      // synchronous eager-execution, leaving a value read from inside it
      // stale by the time this function returns.
      const newCount = stateRef.current.prestigeCount + 1;
      setState(() => freshState(npcs, newCount));
      setLastKill(null);
      setLastContainerOpen(null);
      return newCount;
    }

    if (!supabase) return null;
    const { data, error } = await supabase.rpc("prestige");
    if (error) {
      console.error("prestige failed", error);
      return null;
    }
    const cloud = await loadCloudState(userId, npcs, allItems);
    if (cloud) setState(cloud);
    setLastKill(null);
    setLastContainerOpen(null);
    return typeof data === "number" ? data : null;
  }, [userId, npcs, allItems]);

  const resetAll = useCallback(() => {
    // Signed-in progress isn't resettable from here — there's no "wipe my
    // cloud save" RPC (deliberately out of scope), so this only applies to
    // guest/local play. The UI hides/disables reset while signed in.
    if (userId) return;
    setState(freshState(npcs));
    setLastKill(null);
    setLastContainerOpen(null);
  }, [userId, npcs]);

  const closeContainerModal = useCallback(() => setLastContainerOpen(null), []);

  const totalKills = useMemo(
    () => Object.values(state.killCounts).reduce((a, b) => a + b, 0),
    [state.killCounts],
  );

  const uniqueItemsObtained = useMemo(() => Object.keys(state.collectionLog).length, [state.collectionLog]);

  // Free-tier bosses (unlockCost === 0, e.g. Brutus/Obor) are always treated
  // as unlocked regardless of what's in stored/synced unlockedNpcIds — signed-in
  // accounts created (or prestiged) before a boss became free otherwise show it
  // as locked and require a pointless 0-gp "unlock" click.
  const unlockedNpcIds = useMemo(() => {
    const ids = new Set(state.unlockedNpcIds);
    for (const n of npcs) {
      if (n.unlockCost === 0) ids.add(n.id);
    }
    return ids;
  }, [state.unlockedNpcIds, npcs]);

  const canPrestige = useMemo(
    () => npcs.length > 0 && npcs.every((n) => unlockedNpcIds.has(n.id)),
    [npcs, unlockedNpcIds],
  );

  return {
    isCloudSynced: Boolean(userId),
    inventory: state.inventory,
    log: state.log,
    killCounts: state.killCounts,
    containerOpenCounts: state.containerOpenCounts,
    collectionLog: state.collectionLog,
    collectionLogFirsts: state.collectionLogFirsts,
    gp: state.gp,
    unlockedNpcIds,
    totalNpcCount: npcs.length,
    prestigeCount: state.prestigeCount,
    canPrestige,
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
    prestige,
    resetAll,
  };
}
