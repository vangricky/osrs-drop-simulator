import { useEffect } from "react";

interface PrestigeCelebrationProps {
  prestigeCount: number;
  onDismiss: () => void;
}

const PARTICLE_COUNT = 20;

export default function PrestigeCelebration({ prestigeCount, onDismiss }: PrestigeCelebrationProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3800);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onDismiss}>
      <div className="relative flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          <div className="unlock-ray-spin pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full" />

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

          <img
            src="https://oldschool.runescape.wiki/images/Max_cape.png"
            alt=""
            className="unlock-icon-pop relative z-10 h-28 w-28 object-contain drop-shadow-[0_0_20px_rgba(255,183,0,0.8)]"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
        </div>

        <p className="unlock-text-pop relative z-10 mt-4 font-display text-3xl font-bold uppercase tracking-widest text-osrs-gold drop-shadow-[0_0_10px_rgba(255,183,0,0.9)]">
          Prestige!
        </p>
        <p className="unlock-text-pop relative z-10 mt-1 text-lg font-semibold text-osrs-parchment">
          Prestige {prestigeCount}
        </p>
        <p className="unlock-text-pop relative z-10 mt-1 max-w-xs text-center text-xs text-osrs-parchment-dark/70">
          Every monster unlocked. GP, unlocks, and kills are back to zero, and it's on the leaderboard.
        </p>
        <p className="unlock-text-pop relative z-10 mt-4 text-[11px] text-osrs-parchment-dark/50">
          Click anywhere to continue
        </p>
      </div>
    </div>
  );
}
