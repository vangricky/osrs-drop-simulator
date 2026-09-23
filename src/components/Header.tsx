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
  "osrs-cta rounded-[9px] bg-gradient-to-b from-osrs-gold to-osrs-orange px-4 py-2 text-sm font-bold text-osrs-panel-dark shadow-[0_8px_18px_-6px_rgba(255,183,0,0.55)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100";

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
    //
    // The hamburger is pulled OUT of the flex-wrap flow entirely and pinned
    // to the header's top-right corner via `absolute`, instead of being a
    // wrap candidate alongside the other header content. Two earlier
    // attempts both still let it end up alone on its own line at some width:
    // one big flat flex-wrap row of brand+stats+action-buttons+hamburger
    // stranded it at ~393px (exactly 3 of 4 action buttons fit a line, the
    // hamburger wrapped alone); splitting it into its own row paired with
    // brand+stats instead just moved the failure to ~300-320px (once the
    // stats themselves wrap to 2 lines, the hamburger — still a sibling flex
    // item of that whole block — gets pushed to a 3rd line by itself). Any
    // approach where the hamburger participates in wrap-line-packing
    // alongside a variable-height sibling can orphan it at *some* width;
    // taking it out of flow entirely is the only way to rule that out at
    // every width rather than just the ones tested. The flowing content
    // below reserves right padding (`pr-14`/`sm:pr-20`) so it never runs
    // under the pinned button, however many lines it wraps to.
    <header className="osrs-bevel osrs-panel sticky top-0 inset-x-0 z-20 shadow-lg relative" style={{ borderRadius: 0 }}>
      <div className="relative shrink-0" ref={menuRef}>
        {/* This inner div, not the button itself, carries the absolute
            positioning — sized to exactly match the logo's own height
            (h-8/sm:h-10, see the logo img below), which is what actually
            sets the flowing row's line-box height that Collection
            log/Prestige/Leaderboard get vertically centered within via that
            row's `items-center`. The button is a plain flex child centered
            inside this div. Positioning the button directly with a guessed
            top offset (the previous version) put its own center ~3px above
            that shared centerline — right, but not verified against it, so
            it silently drifted from anything the row's height happened to
            do. Matching the same height value the row is actually driven by
            makes the two centerlines equal by construction instead of by
            coincidence. */}
        <div className="absolute right-4 top-3 flex h-8 items-center sm:right-6 sm:top-3.5 sm:h-10">
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
        </div>

        {/* Always mounted (not conditionally rendered) so opening and
            closing both animate — closed state fades/scales/slides out via
            CSS transition instead of the menu just popping away. Positioned
            against the same outer wrapper as the button-sizing div above,
            independently of it (this is not nested inside that div) — its
            right offset matches the button's (right-4/right-6) and its top
            offset (top-14/top-[58px]) is set to clear the button's actual
            rendered bottom edge with a small visible gap, verified against
            real layout rather than computed from the button's nominal
            height, since the button now sits centered inside a slightly
            taller sizing div (see above) rather than at a raw top offset. */}
        <div
          aria-hidden={!menuOpen}
          className={`osrs-bevel osrs-panel absolute right-4 top-14 z-30 w-56 origin-top-right shadow-xl transition duration-150 ease-out sm:right-6 sm:top-[58px] ${
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

            {/* Plain <a>, not a client-side route — /bosses/ is its own
                generated static page set (see scripts/generate-boss-pages.mjs),
                same as /faq/ and /pet-drop-sim/. */}
            <a
              href="/bosses/"
              onClick={() => setMenuOpen(false)}
              className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
            >
              Boss drop tables
            </a>

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

      {/* Reserves room for the pinned hamburger (right-4/right-6, 36px wide)
          on every wrapped line below, so nothing ever runs under it. */}
      <div className="flex flex-col gap-2 py-3 pl-4 pr-14 sm:py-3.5 sm:pl-6 sm:pr-20">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Brand + read-only stats. */}
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

          {/* Action buttons: their own wrap group, no longer sharing wrap
              context with the (now unpinned-from-flow) hamburger. */}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
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
          </div>
        </div>
      </div>
    </header>
  );
}
