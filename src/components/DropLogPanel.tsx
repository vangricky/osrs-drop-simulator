import { useGameData } from "../hooks/useGameData";
import type { LogEntry } from "../hooks/useGameState";
import IconImg from "./IconImg";

interface DropLogPanelProps {
  log: LogEntry[];
}

function timeAgo(ts: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function DropLogPanel({ log }: DropLogPanelProps) {
  const { items: allItems } = useGameData();
  return (
    <div className="osrs-bevel osrs-panel flex h-full min-h-0 flex-col">
      <div className="border-b-2 border-osrs-border-dark px-3.5 py-2.5">
        <h2 className="font-display text-base font-bold uppercase tracking-wide text-osrs-gold">Drop Log</h2>
      </div>
      <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto">
        {log.length === 0 ? (
          <p className="p-4 text-center text-sm text-osrs-parchment-dark/50">
            No kills yet. Simulate a drop to see it here.
          </p>
        ) : (
          <ul className="divide-y divide-osrs-border-dark/40">
            {log.map((entry) => (
              <li key={entry.id} className="px-3.5 py-2.5">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-osrs-parchment">
                    {entry.npcName}
                    {/* Guests can carry a localStorage save from before this
                        was tracked — those older entries won't have it. */}
                    {typeof entry.sourceCount === "number" && (
                      <>
                        {" "}
                        <span className="font-normal text-osrs-parchment-dark/50">
                          ({entry.sourceType === "container" ? "open" : "kill"} #{entry.sourceCount})
                        </span>
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-osrs-parchment-dark/50">{timeAgo(entry.timestamp)}</span>
                </div>
                {entry.drops.length === 0 ? (
                  <p className="text-xs italic text-osrs-parchment-dark/50">Nothing</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {entry.drops.map((d, i) => {
                      const item = allItems[d.itemId];
                      if (!item) return null;
                      return (
                        <div
                          key={`${d.itemId}-${i}`}
                          className="osrs-bevel-inset flex items-center gap-1 bg-osrs-panel-dark/50 px-1 py-0.5"
                          title={item.name}
                        >
                          <IconImg src={item.iconUrl} alt={item.name} className="h-6 w-6" />
                          {d.quantity > 1 && (
                            <span className="text-xs text-osrs-parchment-dark/70">x{d.quantity}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
