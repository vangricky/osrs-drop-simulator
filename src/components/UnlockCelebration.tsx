import { useEffect } from "react";
import type { Npc } from "../data/npcData";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

interface UnlockCelebrationProps {
  npc: Npc;
  onDismiss: () => void;
}

const PARTICLE_COUNT = 16;

export default function UnlockCelebration({ npc, onDismiss }: UnlockCelebrationProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3200);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onDismiss}
    >
      <div className="relative flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          <div className="unlock-ray-spin pointer-events-none absolute left-1/2 top-1/2 h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full" />

          {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
            const angle = (360 / PARTICLE_COUNT) * i;
            return (
              <span
                key={i}
                className="unlock-particle pointer-events-none absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-osrs-gold"
                style={{ ["--angle" as string]: `${angle}deg`, animationDelay: `${(i % 4) * 60}ms` }}
              />
            );
          })}

          <div className="unlock-icon-pop relative z-10">
            <IconImg src={npc.iconUrl} alt={npc.name} className="h-28 w-28 drop-shadow-[0_0_20px_rgba(255,183,0,0.8)]" />
          </div>
        </div>

        <p className="unlock-text-pop relative z-10 mt-4 font-display text-3xl font-bold uppercase tracking-widest text-osrs-gold drop-shadow-[0_0_10px_rgba(255,183,0,0.9)]">
          Unlocked!
        </p>
        <p className="unlock-text-pop relative z-10 mt-1 text-lg font-semibold text-osrs-parchment">{npc.name}</p>
        <p className="unlock-text-pop relative z-10 mt-1 text-xs text-osrs-parchment-dark/70">
          Spent {formatGp(npc.unlockCost)} gp
        </p>
        <p className="unlock-text-pop relative z-10 mt-4 text-[11px] text-osrs-parchment-dark/50">
          Click anywhere to continue
        </p>
      </div>
    </div>
  );
}
