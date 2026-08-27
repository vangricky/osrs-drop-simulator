import { useEffect, useMemo, useRef, useState } from "react";
import { useGameData } from "./hooks/useGameData";
import { getPetBosses, rollForPet, type PetBossInfo } from "./data/petBosses";
import { orbGlowStyle } from "./utils/dropLogic";
import PetSimHeader from "./components/PetSimHeader";
import IconImg from "./components/IconImg";

// Always shown as a reduced "1/X" (rather than e.g. "5/12,800") to match how
// OSRS rates are conventionally written — matters for Abyssal orphan, whose
// numerator/denominator here is the multiplied-through two-step rate.
function formatRate(numerator: number, denominator: number): string {
  return `1/${Math.round(denominator / numerator).toLocaleString()}`;
}

const ROLL_INTERVAL_MS = 500;

export default function PetSimApp() {
  const { npcs, containers, items } = useGameData();
  const petBosses = useMemo(() => getPetBosses(npcs, containers, items), [npcs, containers, items]);

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PetBossInfo | null>(null);
  const [kc, setKc] = useState(0);
  const [running, setRunning] = useState(false);
  const [wonAt, setWonAt] = useState<number | null>(null);

  const filteredBosses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return petBosses
      .filter((b) => !q || b.npc.name.toLowerCase().includes(q) || b.petName.toLowerCase().includes(q))
      .sort((a, b) => a.npc.combatLevel - b.npc.combatLevel);
  }, [petBosses, search]);

  // The interval owns the actual rolling — kept in a ref so starting/
  // stopping doesn't need to tear down and rebuild on every kc change.
  const intervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running || !selected) return;
    intervalRef.current = window.setInterval(() => {
      const gotPet = rollForPet(selected, items, containers);
      setKc((prev) => {
        const next = prev + 1;
        if (gotPet) {
          setRunning(false);
          setWonAt(next);
        }
        return next;
      });
    }, ROLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running, selected, items, containers]);

  const selectBoss = (info: PetBossInfo) => {
    setSelected(info);
    setKc(0);
    setRunning(false);
    setWonAt(null);
  };

  const changeBoss = () => {
    setSelected(null);
    setRunning(false);
    setWonAt(null);
    setKc(0);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-osrs-bg">
      <PetSimHeader />

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:py-8">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-osrs-gold sm:text-3xl">Pet Drop Sim</h1>
          <p className="mt-1 text-sm text-osrs-parchment-dark/70">
            Pick a boss and auto-roll its real drop rate until the pet drops.
          </p>
        </div>

        {!selected ? (
          <div className="osrs-bevel osrs-panel flex min-h-0 flex-1 flex-col">
            <div className="border-b-2 border-osrs-border-dark p-3.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search boss or pet name..."
                className="osrs-bevel-inset w-full bg-osrs-panel-dark/70 px-3 py-2.5 text-sm text-osrs-parchment placeholder:text-osrs-parchment-dark/50 focus:outline-none"
              />
            </div>
            <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto p-2.5" style={{ maxHeight: "60vh" }}>
              {filteredBosses.length === 0 ? (
                <p className="p-4 text-center text-sm text-osrs-parchment-dark/60">No bosses match that search.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {filteredBosses.map((info) => (
                    <li key={info.npc.id}>
                      <button
                        onClick={() => selectBoss(info)}
                        className="flex w-full items-center gap-3 rounded-lg border-2 border-transparent px-2.5 py-2 text-left transition hover:bg-osrs-panel-dark/40"
                      >
                        <div className="osrs-orb h-10 w-10 shrink-0 p-1">
                          <IconImg src={info.npc.iconUrl} alt={info.npc.name} className="h-full w-full" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-osrs-parchment">{info.npc.name}</p>
                          <p className="truncate text-xs text-osrs-parchment-dark/60">{info.petName}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-xs font-semibold text-osrs-orange">
                            {formatRate(info.numerator, info.denominator)}
                          </span>
                          <IconImg src={info.petIconUrl} alt={info.petName} className="h-8 w-8" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="osrs-bevel osrs-panel flex flex-col items-center gap-5 p-6 text-center">
            <button
              onClick={changeBoss}
              className="osrs-bevel self-start bg-osrs-panel-dark/50 px-3 py-1.5 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
            >
              &larr; Choose a different boss
            </button>

            <div className="flex items-center gap-4">
              <div className={`osrs-orb h-16 w-16 p-2 ${running ? "animate-pulse" : ""}`}>
                <IconImg src={selected.npc.iconUrl} alt={selected.npc.name} className="h-full w-full" />
              </div>
              <span className="font-display text-2xl text-osrs-parchment-dark/50">&rarr;</span>
              <div className={`osrs-orb h-16 w-16 p-2 ${running ? "animate-pulse" : ""}`}>
                <IconImg src={selected.petIconUrl} alt={selected.petName} className="h-full w-full" />
              </div>
            </div>

            <div>
              <h2 className="font-display text-lg font-bold text-osrs-gold">{selected.npc.name}</h2>
              <p className="text-sm text-osrs-parchment-dark/70">
                Hunting: <span className="font-semibold text-osrs-parchment">{selected.petName}</span>{" "}
                <span className="text-osrs-orange">({formatRate(selected.numerator, selected.denominator)})</span>
              </p>
            </div>

            <div className="osrs-bevel-inset w-full bg-osrs-panel-dark/60 p-4">
              <p className="text-xs uppercase tracking-wide text-osrs-parchment-dark/60">Kill count</p>
              <p className="font-display text-4xl font-bold text-osrs-gold">{kc.toLocaleString()}</p>
            </div>

            <div className="flex w-full gap-2">
              <button
                onClick={() => setRunning((r) => !r)}
                className={`osrs-cta flex-1 rounded-[10px] py-3 font-display text-base font-bold uppercase tracking-wide transition hover:brightness-110 ${
                  running
                    ? "bg-gradient-to-b from-osrs-red to-red-800 text-white shadow-[0_10px_24px_-8px_rgba(255,63,63,0.55)]"
                    : "bg-gradient-to-b from-osrs-gold to-osrs-orange text-osrs-panel-dark shadow-[0_10px_24px_-8px_rgba(255,183,0,0.55)]"
                }`}
              >
                {running ? "Stop" : kc === 0 ? "Start rolling" : "Resume"}
              </button>
              {kc > 0 && !running && (
                <button
                  onClick={() => setKc(0)}
                  className="osrs-bevel bg-osrs-panel-dark/50 px-4 py-3 text-sm font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
                >
                  Reset KC
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="shrink-0 px-4 py-1.5 text-center text-[11px] text-osrs-parchment-dark/40">
        Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy.
        This content is not endorsed by or affiliated with Jagex.
      </footer>

      {wonAt !== null && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="osrs-bevel osrs-panel animate-drop-pop w-full max-w-sm p-6 text-center">
            <p className="text-[11px] uppercase tracking-widest text-osrs-parchment-dark/60">Pet obtained!</p>
            <div className="osrs-orb mx-auto my-4 h-24 w-24 p-3" style={orbGlowStyle("255,183,0")}>
              <IconImg src={selected.petIconUrl} alt={selected.petName} className="h-full w-full" />
            </div>
            <h2 className="font-display text-xl font-bold text-osrs-gold">You got {selected.petName}!</h2>
            <p className="mt-1 text-sm text-osrs-parchment-dark/70">
              From {selected.npc.name} at <span className="font-semibold text-osrs-parchment">{wonAt.toLocaleString()}</span> kc
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setWonAt(null);
                  setKc(0);
                }}
                className="osrs-cta flex-1 rounded-[10px] bg-gradient-to-b from-osrs-gold to-osrs-orange py-2.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-panel-dark transition hover:brightness-110"
              >
                Roll again
              </button>
              <button
                onClick={changeBoss}
                className="osrs-bevel bg-osrs-panel-dark/50 px-4 py-2.5 text-sm font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
              >
                New boss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
