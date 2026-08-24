import { useEffect, useRef, useState } from "react";
import { formatGp } from "../utils/dropLogic";

interface HeaderProps {
  gp: number;
  totalKills: number;
  uniqueItemsObtained: number;
  onReset: () => void;
  authEnabled: boolean;
  username: string | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenLeaderboard: () => void;
  onOpenHowToPlay: () => void;
  onOpenCollectionLog: () => void;
  prestigeCount: number;
  canPrestige: boolean;
  unlockedNpcCount: number;
  totalNpcCount: number;
  onOpenPrestige: () => void;
}

const GHOST_BTN =
  "osrs-bevel bg-osrs-panel-dark/50 px-4 py-2 text-sm font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset";
const GOLD_BTN =
  "rounded-[9px] bg-gradient-to-b from-osrs-gold to-osrs-orange px-4 py-2 text-sm font-bold text-osrs-panel-dark shadow-[0_8px_18px_-6px_rgba(255,183,0,0.55)] transition hover:brightness-110";

export default function Header({
  gp,
  totalKills,
  uniqueItemsObtained,
  onReset,
  authEnabled,
  username,
  onOpenAuth,
  onSignOut,
  onOpenLeaderboard,
  onOpenHowToPlay,
  onOpenCollectionLog,
  prestigeCount,
  canPrestige,
  unlockedNpcCount,
  totalNpcCount,
  onOpenPrestige,
}: HeaderProps) {
  const prestigeTitle = canPrestige
    ? "Every monster is unlocked. Prestige to reset and climb again."
    : `${unlockedNpcCount}/${totalNpcCount} monsters unlocked`;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click/tap.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    // Stays pinned to the viewport top while the page scrolls (a plain
    // `sticky top-0` element, not `fixed` — no content offset needed) so GP
    // and kill count stay visible on mobile without scrolling back up.
    <header className="osrs-bevel osrs-panel sticky top-0 inset-x-0 z-20 shadow-lg" style={{ borderRadius: 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-3.5">
        {/* LEFT: brand + read-only stats. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <img
              src="https://oldschool.runescape.wiki/images/Old_School_RuneScape_logo.png"
              alt=""
              className="h-9 w-9 shrink-0 object-contain drop-shadow sm:h-10 sm:w-10"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold tracking-wide text-osrs-gold sm:text-2xl">
                OSRS Drop Simulator
              </h1>
              <p className="hidden text-xs text-osrs-parchment-dark/80 sm:block">
                Roll the drop table. Fill your inventory.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-sm sm:gap-2 sm:text-base">
            <div
              className="osrs-bevel-inset flex items-center gap-2 bg-osrs-panel-dark/60 px-3 py-2 sm:gap-2.5 sm:px-4"
              title={`${gp.toLocaleString()} coins`}
            >
              <span className="text-osrs-parchment-dark/70">GP:</span>
              <span className="font-semibold text-osrs-gold">{formatGp(gp)}</span>
            </div>
            <div className="osrs-bevel-inset flex items-center gap-2 bg-osrs-panel-dark/60 px-3 py-2 sm:gap-2.5 sm:px-4">
              <span className="text-osrs-parchment-dark/70">Kills:</span>
              <span className="font-semibold text-osrs-gold">{totalKills.toLocaleString()}</span>
            </div>
            <div className="osrs-bevel-inset hidden items-center gap-2.5 bg-osrs-panel-dark/60 px-4 py-2 sm:flex">
              <span className="text-osrs-parchment-dark/70">Unique drops:</span>
              <span className="font-semibold text-osrs-gold">{uniqueItemsObtained}</span>
            </div>
            {prestigeCount > 0 && (
              <div
                className="osrs-bevel-inset hidden items-center gap-2 bg-osrs-panel-dark/60 px-3 py-2 sm:flex sm:gap-2.5 sm:px-4"
                title={`Prestiged ${prestigeCount}x`}
              >
                <span className="text-osrs-parchment-dark/70">Prestige:</span>
                <span className="font-semibold text-osrs-gold">{prestigeCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: actions, with everything else tucked behind the hamburger. */}
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onOpenCollectionLog} className={GHOST_BTN}>
            Collection log
          </button>
          <button onClick={onOpenPrestige} disabled={!canPrestige} title={prestigeTitle} className={GOLD_BTN}>
            Prestige
          </button>
          {authEnabled && (
            <button onClick={onOpenLeaderboard} className={GHOST_BTN}>
              Leaderboard
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="osrs-bevel flex h-9 w-9 shrink-0 items-center justify-center bg-osrs-panel-dark/50 text-osrs-parchment-dark/80 active:osrs-bevel-inset"
            >
              <span className="flex flex-col items-center gap-[3px]">
                <span className="block h-[2px] w-4 bg-current" />
                <span className="block h-[2px] w-4 bg-current" />
                <span className="block h-[2px] w-4 bg-current" />
              </span>
            </button>

            {menuOpen && (
              <div className="osrs-bevel osrs-panel absolute right-0 top-[calc(100%+8px)] z-30 w-56 origin-top-right shadow-xl">
                <div className="flex flex-col gap-2 p-3 text-sm">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenHowToPlay();
                    }}
                    className="osrs-bevel bg-osrs-gold/15 px-3 py-2 text-left font-semibold text-osrs-gold transition active:osrs-bevel-inset"
                  >
                    How to play
                  </button>

                  {authEnabled && username && (
                    <div className="px-1 pb-0.5 pt-1 text-xs text-osrs-parchment-dark/70">
                      Signed in as <span className="font-semibold text-osrs-gold">{username}</span>
                    </div>
                  )}

                  {authEnabled && username ? (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onSignOut();
                      }}
                      className="osrs-bevel bg-osrs-panel-dark/50 px-3 py-2 text-left font-semibold text-osrs-parchment-dark/80 transition active:osrs-bevel-inset"
                    >
                      Sign out
                    </button>
                  ) : (
                    authEnabled && (
                      <button
                        onClick={() => {
                          setMenuOpen(false);
                          onOpenAuth();
                        }}
                        className="osrs-bevel bg-osrs-gold/20 px-3 py-2 text-left font-semibold text-osrs-gold transition active:osrs-bevel-inset"
                      >
                        Sign in
                      </button>
                    )
                  )}

                  {!username && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onReset();
                      }}
                      className="osrs-bevel bg-osrs-red/20 px-3 py-2 text-left font-semibold text-osrs-red transition active:osrs-bevel-inset"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
