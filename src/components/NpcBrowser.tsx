import { useMemo, useState } from "react";
import { useGameData } from "../hooks/useGameData";
import type { Npc } from "../data/npcData";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

interface NpcBrowserProps {
  selectedNpcId: string | null;
  onSelect: (npc: Npc) => void;
  killCounts: Record<string, number>;
  unlockedNpcIds: Set<string>;
}

function combatColor(level: number): string {
  if (level >= 200) return "text-osrs-red";
  if (level >= 80) return "text-osrs-orange";
  if (level >= 30) return "text-osrs-gold";
  return "text-osrs-green";
}

export default function NpcBrowser({ selectedNpcId, onSelect, killCounts, unlockedNpcIds }: NpcBrowserProps) {
  const { npcs } = useGameData();
  const [query, setQuery] = useState("");

  // Every monster is a boss now (this is a boss-only simulator), so there's
  // no category left to filter by — just search + a combat-level sort.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return npcs
      .filter((n) => (q ? n.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.combatLevel - b.combatLevel);
  }, [npcs, query]);

  return (
    <div className="osrs-bevel osrs-panel flex max-h-[70vh] min-h-0 flex-col lg:h-full lg:max-h-none">
      <div className="border-b-2 border-osrs-border-dark p-3">
        <h2 className="mb-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold">
          Find an NPC
        </h2>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search monster name..."
          className="osrs-bevel-inset w-full bg-osrs-panel-dark/70 px-3 py-2 text-sm text-osrs-parchment placeholder:text-osrs-parchment-dark/50 focus:outline-none"
        />
      </div>

      <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 && (
          <p className="p-4 text-center text-sm text-osrs-parchment-dark/60">No monsters found.</p>
        )}
        <ul className="flex flex-col gap-1">
          {filtered.map((npc) => {
            const kills = killCounts[npc.id] ?? 0;
            const active = npc.id === selectedNpcId;
            const locked = !unlockedNpcIds.has(npc.id);
            return (
              <li key={npc.id}>
                <button
                  onClick={() => onSelect(npc)}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition ${
                    active
                      ? "osrs-bevel-inset bg-osrs-gold/15"
                      : "border-2 border-transparent hover:bg-osrs-panel-dark/40"
                  } ${locked ? "opacity-60" : ""}`}
                >
                  <IconImg
                    src={npc.iconUrl}
                    alt={npc.name}
                    className={`h-8 w-8 shrink-0 ${locked ? "grayscale" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-osrs-parchment">{npc.name}</span>
                    {locked ? (
                      <span className="block text-[10px] font-semibold text-osrs-red">
                        &#128274; {formatGp(npc.unlockCost)} gp
                      </span>
                    ) : (
                      kills > 0 && (
                        <span className="block text-[10px] text-osrs-parchment-dark/60">{kills} killed</span>
                      )
                    )}
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${combatColor(npc.combatLevel)}`}>
                    {npc.combatLevel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
