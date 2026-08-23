import { useMemo, useState } from "react";
import { npcs, type Npc } from "../data/npcData";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

interface NpcBrowserProps {
  selectedNpcId: string | null;
  onSelect: (npc: Npc) => void;
  killCounts: Record<string, number>;
  unlockedNpcIds: Set<string>;
}

const CATEGORIES: { key: "all" | Npc["category"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "low", label: "Low lvl" },
  { key: "mid", label: "Mid lvl" },
  { key: "boss", label: "Bosses" },
];

function combatColor(level: number): string {
  if (level >= 200) return "text-osrs-red";
  if (level >= 80) return "text-osrs-orange";
  if (level >= 30) return "text-osrs-gold";
  return "text-osrs-green";
}

export default function NpcBrowser({ selectedNpcId, onSelect, killCounts, unlockedNpcIds }: NpcBrowserProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | Npc["category"]>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return npcs
      .filter((n) => (category === "all" ? true : n.category === category))
      .filter((n) => (q ? n.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.combatLevel - b.combatLevel);
  }, [query, category]);

  return (
    <div className="osrs-bevel osrs-panel flex h-full min-h-0 flex-col">
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
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`osrs-bevel px-2 py-1 text-[11px] font-semibold transition ${
                category === c.key
                  ? "bg-osrs-gold/25 text-osrs-gold"
                  : "bg-osrs-panel-dark/50 text-osrs-parchment-dark/80 hover:text-osrs-parchment"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
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
