import { useEffect } from "react";
import { useGameData } from "../hooks/useGameData";
import type { ContainerOpenResult } from "../hooks/useGameState";
import { consolidateDrops, formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

const AUTO_CLOSE_MS = 10_000;

interface ContainerModalProps {
  result: ContainerOpenResult;
  onClose: () => void;
}

export default function ContainerModal({ result, onClose }: ContainerModalProps) {
  const { items: allItems } = useGameData();

  // Auto Open can replace `result` many times a second while this modal
  // stays mounted (no key, same JSX slot) — keying the timer on `result`
  // means each new roll restarts the 10s clock, so it only actually closes
  // 10s after the *last* result shown, not 10s after the modal first opened.
  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [result, onClose]);
  const coinsGained = result.drops
    .filter((d) => d.item.id === "coins")
    .reduce((sum, d) => sum + d.quantity, 0);
  // Several independent rolls (e.g. Barrows/ToA/CoX chests' multiple
  // main-table rolls) can land on the same item — consolidate into one
  // summed chip per item rather than a chip per roll.
  const itemDrops = consolidateDrops(
    result.drops.filter((d) => d.item.id !== "coins"),
    (d) => d.item.id,
  );
  const overflow = consolidateDrops(result.overflow, (d) => d.item.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="osrs-bevel osrs-panel flex max-h-[85vh] w-full max-w-md animate-drop-pop flex-col p-5 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="shrink-0 text-[11px] uppercase tracking-widest text-osrs-parchment-dark/60">You opened</p>
        <h2 className="mb-4 shrink-0 font-display text-lg font-bold text-osrs-gold">{result.containerName}</h2>

        {coinsGained > 0 && (
          <p className="mb-3 shrink-0 font-display text-2xl font-bold text-osrs-gold">+{formatGp(coinsGained)} gp</p>
        )}

        {itemDrops.length > 0 ? (
          // A big multi-roll container (Barrows/ToA/CoX chests) can produce
          // more items than fit in the modal — cap the height and scroll
          // internally instead of the modal overflowing the viewport.
          <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-wrap justify-center gap-2">
              {itemDrops.map((d, i) => (
                <div
                  key={d.item.id}
                  className={`animate-drop-pop osrs-bevel-inset flex flex-col items-center gap-1 p-2 ${
                    d.source === "tertiary" ? "bg-osrs-gold/10 ring-2 ring-osrs-gold" : "bg-osrs-panel-dark/60"
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                  title={`${d.item.name}${d.quantity > 1 ? ` x${d.quantity}` : ""}`}
                >
                  <IconImg src={d.item.iconUrl} alt={d.item.name} className="h-8 w-8" />
                  <span className="max-w-[90px] truncate text-[10px] text-osrs-parchment">
                    {d.item.name}
                    {d.quantity > 1 ? ` x${d.quantity}` : ""}
                  </span>
                  {allItems[d.item.id]?.tradeable && (
                    <span className="text-[10px] text-osrs-gold">
                      {formatGp(allItems[d.item.id].value * d.quantity)} gp
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          coinsGained === 0 && <p className="text-sm italic text-osrs-parchment-dark/60">Nothing of interest.</p>
        )}

        {overflow.length > 0 && (
          <p className="mt-3 shrink-0 text-[11px] font-semibold text-osrs-red">
            Inventory full: {overflow.map((d) => d.item.name).join(", ")} was not obtained!
          </p>
        )}

        <button
          onClick={onClose}
          className="osrs-bevel mt-5 w-full shrink-0 bg-osrs-panel-dark/60 py-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-parchment transition hover:bg-osrs-panel-dark active:osrs-bevel-inset"
        >
          Close
        </button>
      </div>
    </div>
  );
}
