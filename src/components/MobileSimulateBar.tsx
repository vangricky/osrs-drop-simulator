import type { Npc } from "../data/npcData";
import { formatGp } from "../utils/dropLogic";

interface MobileSimulateBarProps {
  npc: Npc | null;
  isUnlocked: boolean;
  gp: number;
  onKill: (npc: Npc) => void;
  onUnlock: (npc: Npc) => void;
}

/** Below lg, the page is a single scrolling column — the NpcDetailPanel's
 * own action button becomes inaccessible the moment you scroll away from it
 * to check the inventory or browse monsters. This stays pinned to the
 * viewport bottom regardless of scroll position, so the action is always
 * one tap away. Hidden on lg+, where the 3-column layout keeps the panel
 * (and its own button) always on screen already. */
export default function MobileSimulateBar({ npc, isUnlocked, gp, onKill, onUnlock }: MobileSimulateBarProps) {
  if (!npc) return null;

  return (
    <div
      className="osrs-bevel osrs-panel fixed inset-x-0 bottom-0 z-30 p-2 shadow-[0_-4px_16px_rgba(0,0,0,0.5)] lg:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      {isUnlocked ? (
        <button
          onClick={() => onKill(npc)}
          className="osrs-bevel w-full bg-gradient-to-b from-osrs-gold/30 to-osrs-gold/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold shadow-md transition active:osrs-bevel-inset"
        >
          Simulate Drop
        </button>
      ) : (
        <button
          onClick={() => onUnlock(npc)}
          disabled={gp < npc.unlockCost}
          className="osrs-bevel w-full bg-gradient-to-b from-osrs-red/30 to-osrs-red/10 py-3 font-display text-sm font-bold uppercase tracking-wide text-osrs-red shadow-md transition active:osrs-bevel-inset disabled:cursor-not-allowed disabled:opacity-40"
        >
          Unlock {npc.name} for {formatGp(npc.unlockCost)} gp
        </button>
      )}
    </div>
  );
}
