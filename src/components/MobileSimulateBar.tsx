import type { Npc } from "../data/npcData";
import { formatGp } from "../utils/dropLogic";

interface MobileSimulateBarProps {
  npc: Npc | null;
  isUnlocked: boolean;
  gp: number;
  onKill: (npc: Npc) => void;
  onUnlock: (npc: Npc) => void;
  autoKilling: boolean;
  onToggleAutoKill: () => void;
}

/** Below lg, the page is a single scrolling column — the NpcDetailPanel's
 * own action button becomes inaccessible the moment you scroll away from it
 * to check the inventory or browse monsters. This stays pinned to the
 * viewport bottom regardless of scroll position, so the action is always
 * one tap away. Hidden on lg+, where the 3-column layout keeps the panel
 * (and its own button) always on screen already. */
export default function MobileSimulateBar({
  npc,
  isUnlocked,
  gp,
  onKill,
  onUnlock,
  autoKilling,
  onToggleAutoKill,
}: MobileSimulateBarProps) {
  if (!npc) return null;

  return (
    <div
      className="osrs-bevel osrs-panel fixed inset-x-0 bottom-0 z-30 p-2 shadow-[0_-4px_16px_rgba(0,0,0,0.5)] lg:hidden"
      style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
    >
      {isUnlocked ? (
        <div className="flex gap-2">
          <button
            onClick={() => onKill(npc)}
            disabled={autoKilling}
            className="osrs-cta flex-1 rounded-[10px] bg-gradient-to-b from-osrs-gold to-osrs-orange py-3 font-display text-sm font-bold uppercase tracking-wide text-osrs-panel-dark shadow-[0_10px_24px_-8px_rgba(255,183,0,0.55)] transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Simulate Drop
          </button>
          <button
            onClick={onToggleAutoKill}
            className={`osrs-cta flex-1 rounded-[10px] py-3 font-display text-sm font-bold uppercase tracking-wide transition active:brightness-95 ${
              autoKilling
                ? "bg-gradient-to-b from-osrs-red to-red-800 text-white shadow-[0_10px_24px_-8px_rgba(255,63,63,0.55)]"
                : "bg-osrs-panel-dark/50 text-osrs-parchment-dark/80"
            }`}
          >
            {autoKilling ? "Stop" : "Auto Kill"}
          </button>
        </div>
      ) : (
        <button
          onClick={() => onUnlock(npc)}
          disabled={gp < npc.unlockCost}
          className="osrs-cta w-full rounded-[10px] bg-gradient-to-b from-osrs-red to-red-800 py-3 font-display text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_24px_-8px_rgba(255,63,63,0.55)] transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Unlock {npc.name} for {formatGp(npc.unlockCost)} gp
        </button>
      )}
    </div>
  );
}
