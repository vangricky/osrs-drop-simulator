import { useMemo, useState } from "react";
import { useGameData } from "../hooks/useGameData";
import type { CollectionLogFirst } from "../hooks/useGameState";
import IconImg from "./IconImg";

interface CollectionLogModalProps {
  collectionLogFirsts: Record<string, CollectionLogFirst>;
  onClose: () => void;
}

interface LogRow {
  itemId: string;
  name: string;
  iconUrl: string;
  first: CollectionLogFirst | null;
}

interface HoverInfo {
  row: LogRow;
  left: number;
  top: number;
}

export default function CollectionLogModal({ collectionLogFirsts, onClose }: CollectionLogModalProps) {
  const { npcs, containers, items: allItems } = useGameData();
  const [search, setSearch] = useState("");
  // Positioned via getBoundingClientRect + `fixed`, not `absolute` relative
  // to the grid cell — the grid scrolls (overflow-y-auto), and an
  // absolutely-positioned tooltip above/below a cell near the top or bottom
  // of that scroll area gets clipped by it (same issue InventoryGrid's
  // first-row tooltip had). `fixed` positioning escapes that entirely since
  // it's relative to the viewport, not the scroll container.
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Every item that can actually drop from something, across every monster
  // and container's loot tables — coins excluded, same as the real game's
  // collection log not listing plain coin drops.
  const rows = useMemo<LogRow[]>(() => {
    const ids = new Set<string>();
    for (const source of [...npcs, ...Object.values(containers)]) {
      for (const entry of [...source.always, ...source.mainTable, ...source.tertiary]) {
        if (entry.itemId !== "coins") ids.add(entry.itemId);
      }
    }
    const out: LogRow[] = [];
    for (const itemId of ids) {
      const item = allItems[itemId];
      if (!item) continue;
      out.push({ itemId, name: item.name, iconUrl: item.iconUrl, first: collectionLogFirsts[itemId] ?? null });
    }
    return out;
  }, [npcs, containers, allItems, collectionLogFirsts]);

  const obtainedCount = rows.reduce((sum, r) => sum + (r.first ? 1 : 0), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
    const obtained = visible.filter((r) => r.first).sort((a, b) => b.first!.timestamp - a.first!.timestamp);
    const locked = visible.filter((r) => !r.first).sort((a, b) => a.name.localeCompare(b.name));
    return [...obtained, ...locked];
  }, [rows, search]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="osrs-bevel osrs-panel flex max-h-[85vh] w-full max-w-3xl flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-osrs-gold">Collection log</h2>
          <button
            onClick={onClose}
            className="osrs-bevel shrink-0 bg-osrs-panel-dark/50 px-2 py-1 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Close
          </button>
        </div>
        <p className="mb-3 text-xs text-osrs-parchment-dark/70">
          <span className="font-semibold text-osrs-gold">
            {obtainedCount} / {rows.length}
          </span>{" "}
          items obtained
        </p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="osrs-bevel-inset mb-3 w-full bg-osrs-panel-dark/70 px-3 py-2 text-sm text-osrs-parchment placeholder:text-osrs-parchment-dark/50 focus:outline-none"
        />

        <div
          className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto pr-1"
          onScroll={() => setHover(null)}
        >
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-osrs-parchment-dark/60">No items match that search.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
              {filtered.map((row) => (
                <div
                  key={row.itemId}
                  className="osrs-bevel-inset relative flex aspect-square flex-col items-center justify-center gap-1 bg-osrs-panel-dark/50 p-1.5"
                  title={row.first ? undefined : row.name}
                  onMouseEnter={(e) => {
                    if (!row.first) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHover({ row, left: rect.left + rect.width / 2, top: rect.top });
                  }}
                  onMouseLeave={() => setHover((h) => (h?.row.itemId === row.itemId ? null : h))}
                >
                  <IconImg
                    src={row.iconUrl}
                    alt={row.name}
                    className={`h-8 w-8 sm:h-9 sm:w-9 ${row.first ? "" : "opacity-30 grayscale"}`}
                  />
                  <span
                    className={`w-full truncate text-center text-[9px] leading-tight ${
                      row.first ? "text-osrs-parchment" : "text-osrs-parchment-dark/40"
                    }`}
                  >
                    {row.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {hover?.row.first && (
          <div
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-none bg-osrs-panel-dark px-2 py-1 text-[11px] text-osrs-parchment shadow-lg ring-1 ring-osrs-border-light"
            style={{ left: hover.left, top: hover.top - 8 }}
          >
            <div className="font-semibold text-osrs-gold">{hover.row.name}</div>
            <div className="text-osrs-parchment-dark/80">
              {hover.row.first.sourceName} {hover.row.first.sourceType === "kill" ? "kill" : "open"} #
              {hover.row.first.sourceCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
