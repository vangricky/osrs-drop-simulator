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
  "osrs-cta rounded-[9px] bg-gradient-to-b from-osrs-gold to-osrs-orange px-4 py-2 text-sm font-bold text-osrs-panel-dark shadow-[0_8px_18px_-6px_rgba(255,183,0,0.55)]";

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
              src="/brand/logo.png"
              alt="OSRS Drop Simulator"
              className="h-8 w-auto shrink-0 object-contain drop-shadow sm:h-10"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <div className="min-w-0">
              {/* The logo image above carries the wordmark visually; this
                  stays for accessibility/SEO (page title, screen readers)
                  without duplicating "OSRS Drop Simulator" on screen. */}
              <h1 className="sr-only">OSRS Drop Simulator</h1>
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
              className="osrs-bevel flex h-9 w-9 shrink-0 items-center justify-center bg-osrs-panel-dark/50 text-osrs-parchment-dark/80 transition active:osrs-bevel-inset"
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <span
                  className={`absolute block h-[2px] w-4 rounded-full bg-current transition-transform duration-200 ease-out ${
                    menuOpen ? "translate-y-0 rotate-45" : "-translate-y-[5px] rotate-0"
                  }`}
                />
                <span
                  className={`absolute block h-[2px] w-4 rounded-full bg-current transition-opacity duration-150 ease-out ${
                    menuOpen ? "opacity-0" : "opacity-100"
                  }`}
                />
                <span
                  className={`absolute block h-[2px] w-4 rounded-full bg-current transition-transform duration-200 ease-out ${
                    menuOpen ? "translate-y-0 -rotate-45" : "translate-y-[5px] rotate-0"
                  }`}
                />
              </span>
            </button>

            {/* Always mounted (not conditionally rendered) so opening and
                closing both animate — closed state fades/scales/slides out
                via CSS transition instead of the menu just popping away. */}
            <div
              aria-hidden={!menuOpen}
              className={`osrs-bevel osrs-panel absolute right-0 top-[calc(100%+8px)] z-30 w-56 origin-top-right shadow-xl transition duration-150 ease-out ${
                menuOpen
                  ? "translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none -translate-y-1 scale-95 opacity-0"
              }`}
            >
              <div className="flex flex-col gap-1 p-2 text-sm">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenHowToPlay();
                  }}
                  className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
                >
                  How to play
                </button>

                <a
                  href="/faq/"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
                >
                  FAQ
                </a>

                <a
                  href="/pet-drop-sim/"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
                >
                  Pet Drop Simulator
                </a>

                <a
                  href="https://buymeacoffee.com/osrsdropsimulation"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
                >
                  &#9749; Buy me a coffee
                </a>

                {authEnabled && username && (
                  <div className="px-3 pb-0.5 pt-1 text-xs text-osrs-parchment-dark/70">
                    Signed in as <span className="font-semibold text-osrs-gold">{username}</span>
                  </div>
                )}

                {authEnabled && username ? (
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-parchment-dark/80 transition hover:bg-osrs-panel-dark/60 hover:text-osrs-parchment"
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
                      className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
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
                    className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-red transition hover:bg-osrs-red/15"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
