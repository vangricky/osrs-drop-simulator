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

  // Close the mobile menu on an outside click/tap.
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
    <header className="osrs-bevel osrs-panel sticky top-4 z-20 mx-4 mt-4 shadow-lg">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:flex-wrap sm:gap-4 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img
            src="https://oldschool.runescape.wiki/images/Old_School_RuneScape_logo.png"
            alt=""
            className="h-8 w-8 shrink-0 object-contain drop-shadow sm:h-9 sm:w-9"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-bold tracking-wide text-osrs-gold sm:text-2xl">
              OSRS Drop Simulator
            </h1>
            <p className="hidden text-xs text-osrs-parchment-dark/80 sm:block">
              Roll the drop table. Fill your inventory.
            </p>
          </div>
        </div>

        {/* GP/kills/unique-drops badges and (on sm+) the full action row.
            Fixed-size (shrink-0) so the title above truncates first on a
            narrow phone instead of pushing these off-screen. */}
        <div className="flex shrink-0 items-center gap-2 text-xs sm:flex-wrap sm:gap-3 sm:text-sm">
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

          {/* sm+ (tablet/desktop): every control shown inline, same as before. */}
          <div className="hidden items-center gap-3 sm:flex">
            <button
              onClick={onOpenHowToPlay}
              className="osrs-bevel bg-osrs-panel-dark/50 px-4 py-2 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
            >
              How to play
            </button>
            <button
              onClick={onOpenCollectionLog}
              className="osrs-bevel bg-osrs-panel-dark/50 px-4 py-2 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
            >
              Collection log
            </button>
            <button
              onClick={onOpenPrestige}
              disabled={!canPrestige}
              title={prestigeTitle}
              className="rounded-[9px] bg-gradient-to-b from-osrs-gold to-osrs-orange px-4 py-2 text-xs font-bold text-osrs-panel-dark shadow-[0_8px_18px_-6px_rgba(255,183,0,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-osrs-panel-dark/30 disabled:bg-none disabled:text-osrs-parchment-dark/40 disabled:shadow-none disabled:hover:brightness-100"
            >
              Prestige
            </button>
            {authEnabled && (
              <button
                onClick={onOpenLeaderboard}
                className="osrs-bevel bg-osrs-panel-dark/50 px-4 py-2 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
              >
                Leaderboard
              </button>
            )}
            {authEnabled && username ? (
              <>
                <span className="text-xs text-osrs-parchment-dark/70">
                  Signed in as <span className="font-semibold text-osrs-gold">{username}</span>
                </span>
                <button
                  onClick={onSignOut}
                  className="osrs-bevel bg-osrs-panel-dark/50 px-4 py-2 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
                >
                  Sign out
                </button>
              </>
            ) : (
              authEnabled && (
                <button
                  onClick={onOpenAuth}
                  className="rounded-[9px] bg-gradient-to-b from-osrs-gold to-osrs-orange px-4 py-2 text-xs font-bold text-osrs-panel-dark shadow-[0_8px_18px_-6px_rgba(255,183,0,0.55)] transition hover:brightness-110"
                >
                  Sign in
                </button>
              )
            )}
            {!username && (
              <button
                onClick={onReset}
                className="osrs-bevel bg-osrs-red/20 px-4 py-2 text-xs font-semibold text-osrs-red transition hover:bg-osrs-red/30 active:osrs-bevel-inset"
              >
                Reset
              </button>
            )}
          </div>

          {/* Below sm: everything else collapses into a hamburger menu so
              the sticky bar stays a single compact row. */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="osrs-bevel flex h-8 w-8 shrink-0 items-center justify-center bg-osrs-panel-dark/50 text-osrs-parchment-dark/80 active:osrs-bevel-inset"
            >
              <span className="flex flex-col items-center gap-[3px]">
                <span className="block h-[2px] w-4 bg-current" />
                <span className="block h-[2px] w-4 bg-current" />
                <span className="block h-[2px] w-4 bg-current" />
              </span>
            </button>

            {menuOpen && (
              <div className="osrs-bevel osrs-panel absolute right-0 top-[calc(100%+8px)] z-30 w-56 origin-top-right shadow-xl">
                <div className="flex flex-col gap-2 p-3 text-xs">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenHowToPlay();
                    }}
                    className="osrs-bevel bg-osrs-gold/15 px-3 py-2 text-left font-semibold text-osrs-gold transition active:osrs-bevel-inset"
                  >
                    How to play
                  </button>
                  {username && (
                    <div className="px-1 pb-0.5 pt-1 text-osrs-parchment-dark/70">
                      Signed in as <span className="font-semibold text-osrs-gold">{username}</span>
                    </div>
                  )}
                  <div className="osrs-bevel-inset flex items-center justify-between bg-osrs-panel-dark/60 px-3 py-2">
                    <span className="text-osrs-parchment-dark/70">Unique drops</span>
                    <span className="font-semibold text-osrs-gold">{uniqueItemsObtained}</span>
                  </div>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenCollectionLog();
                    }}
                    className="osrs-bevel bg-osrs-panel-dark/50 px-3 py-2 text-left font-semibold text-osrs-parchment-dark/80 transition active:osrs-bevel-inset"
                  >
                    Collection log
                  </button>
                  {prestigeCount > 0 && (
                    <div className="osrs-bevel-inset flex items-center justify-between bg-osrs-panel-dark/60 px-3 py-2">
                      <span className="text-osrs-parchment-dark/70">Prestige</span>
                      <span className="font-semibold text-osrs-gold">{prestigeCount}</span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenPrestige();
                    }}
                    disabled={!canPrestige}
                    title={prestigeTitle}
                    className="osrs-bevel bg-osrs-gold/20 px-3 py-2 text-left font-semibold text-osrs-gold transition active:osrs-bevel-inset disabled:cursor-not-allowed disabled:bg-osrs-panel-dark/30 disabled:text-osrs-parchment-dark/40"
                  >
                    Prestige
                  </button>

                  {authEnabled && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenLeaderboard();
                      }}
                      className="osrs-bevel bg-osrs-panel-dark/50 px-3 py-2 text-left font-semibold text-osrs-parchment-dark/80 transition active:osrs-bevel-inset"
                    >
                      Leaderboard
                    </button>
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
