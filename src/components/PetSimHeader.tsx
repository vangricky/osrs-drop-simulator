import { useEffect, useRef, useState } from "react";

const GHOST_BTN =
  "osrs-bevel bg-osrs-panel-dark/50 px-4 py-2 text-sm font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset";

/**
 * Trimmed-down header for the standalone Pet Drop Sim page — same visual
 * shell as the main Header (logo, hamburger menu), but without any of the
 * main game's state (GP, kill count, prestige, collection log, auth) since
 * none of it applies here. A visible "Drop Simulator" link is the primary
 * way back to the main site; the hamburger duplicates it alongside the
 * other general site links for consistency with the main header's pattern.
 */
export default function PetSimHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  return (
    <header className="osrs-bevel osrs-panel sticky top-0 inset-x-0 z-20 shadow-lg" style={{ borderRadius: 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <img
            src="/brand/logo.png"
            alt="OSRS Drop Simulator"
            className="h-8 w-auto shrink-0 object-contain drop-shadow sm:h-10"
            onError={(e) => (e.currentTarget.style.display = "none")}
          />
          <div className="min-w-0">
            <h1 className="sr-only">Pet Drop Sim</h1>
            <p className="hidden text-xs text-osrs-parchment-dark/80 sm:block">
              Auto-roll a boss until you get the pet.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <a href="/" className={GHOST_BTN}>
            &larr; Drop Simulator
          </a>

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

            <div
              aria-hidden={!menuOpen}
              className={`osrs-bevel osrs-panel absolute right-0 top-[calc(100%+8px)] z-30 w-56 origin-top-right shadow-xl transition duration-150 ease-out ${
                menuOpen
                  ? "translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none -translate-y-1 scale-95 opacity-0"
              }`}
            >
              <div className="flex flex-col gap-1 p-2 text-sm">
                <a
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
                >
                  Drop Simulator
                </a>

                <a
                  href="/faq/"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-left font-semibold text-osrs-gold transition hover:bg-osrs-gold/15"
                >
                  FAQ
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
