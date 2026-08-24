import { useGameData } from "../hooks/useGameData";
import type { DropEntry, Npc } from "../data/npcData";
import type { KillResult } from "../hooks/useGameState";
import { RARITY_STYLES, formatDropRate, formatGp, orbGlowStyle, rarityTier } from "../utils/dropLogic";
import IconImg from "./IconImg";

// RolledDrop.source doesn't carry a rarity tier, just where it came from —
// this is a coarser stand-in so the "You received" chips still get a
// tier-ish glow color without threading the full DropEntry through.
const SOURCE_GLOW_RGB: Record<string, string> = {
  always: "148,163,184",
  main: "255,183,0",
  tertiary: "192,132,252",
};

interface NpcDetailPanelProps {
  npc: Npc | null;
  killCount: number;
  lastKill: KillResult | null;
  isUnlocked: boolean;
  gp: number;
  onKill: (npc: Npc) => void;
  onUnlock: (npc: Npc) => void;
}

function DropRow({ entry }: { entry: DropEntry }) {
  const { items: allItems } = useGameData();
  const item = allItems[entry.itemId];
  if (!item) return null;
  const tier = rarityTier(entry);
  const style = RARITY_STYLES[tier];
  return (
    <li className="flex items-center gap-2 border-b border-osrs-border-dark/40 px-2 py-1.5 last:border-b-0">
      <div className="osrs-orb h-8 w-8 shrink-0 p-1" style={orbGlowStyle(style.glowRgb)}>
        <IconImg src={item.iconUrl} alt={item.name} className="h-full w-full" />
      </div>
      <span className="min-w-0 flex-1 truncate text-xs text-osrs-parchment">
        {item.name}
        {entry.maxQuantity > 1 && (
          <span className="text-osrs-parchment-dark/60"> ({entry.minQuantity}-{entry.maxQuantity})</span>
        )}
      </span>
      <span className={`shrink-0 text-[11px] font-semibold ${style.text}`}>{formatDropRate(entry)}</span>
    </li>
  );
}

export default function NpcDetailPanel({ npc, killCount, lastKill, isUnlocked, gp, onKill, onUnlock }: NpcDetailPanelProps) {
  if (!npc) {
    return (
      <div className="osrs-bevel osrs-panel flex h-full min-h-0 flex-col items-center justify-center gap-3 p-8 text-center">
        <img
          src="https://oldschool.runescape.wiki/images/Old_School_RuneScape_logo.png"
          alt=""
          className="h-16 w-16 opacity-30"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <p className="font-display text-lg text-osrs-parchment-dark/70">Select an NPC to begin</p>
        <p className="max-w-xs text-sm text-osrs-parchment-dark/50">
          Search or pick a monster on the left, then simulate a kill to roll its drop table.
        </p>
      </div>
    );
  }

  const showLast = lastKill && lastKill.drops.length > 0;

  return (
    <div className="osrs-bevel osrs-panel flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b-2 border-osrs-border-dark p-3">
        <div className="osrs-orb h-14 w-14 shrink-0 p-2" style={orbGlowStyle("255,63,63")}>
          <IconImg src={npc.iconUrl} alt={npc.name} className="h-full w-full" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold text-osrs-gold">{npc.name}</h2>
          <p className="text-xs text-osrs-parchment-dark/70">
            Combat level {npc.combatLevel} &middot; {killCount.toLocaleString()} killed
          </p>
        </div>
      </div>

      <p className="border-b border-osrs-border-dark/40 px-3 py-2 text-xs italic text-osrs-parchment-dark/70">
        {npc.examine}
      </p>

      <div className="flex flex-col gap-2 px-3 py-3">
        {!isUnlocked ? (
          <div className="osrs-bevel-inset flex flex-col items-center gap-2 bg-osrs-panel-dark/50 p-4 text-center">
            <span className="text-2xl">&#128274;</span>
            <p className="text-sm font-semibold text-osrs-parchment">{npc.name} is locked</p>
            <p className="text-xs text-osrs-parchment-dark/60">
              Grind other monsters and sell your loot to afford this unlock.
            </p>
            {/* Below lg, the fixed MobileSimulateBar handles this same action —
                a duplicate button here would just be redundant clutter. */}
            <button
              onClick={() => onUnlock(npc)}
              disabled={gp < npc.unlockCost}
              className="mt-1 hidden w-full rounded-[10px] bg-gradient-to-b from-osrs-red to-red-800 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-white shadow-[0_10px_24px_-8px_rgba(255,63,63,0.55)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 lg:block"
            >
              Unlock for {formatGp(npc.unlockCost)} gp
            </button>
            <p className="text-[11px] text-osrs-parchment-dark/50">
              You have {formatGp(gp)} gp
            </p>
          </div>
        ) : (
          <button
            onClick={() => onKill(npc)}
            className="hidden rounded-[10px] bg-gradient-to-b from-osrs-gold to-osrs-orange py-2.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-panel-dark shadow-[0_10px_24px_-8px_rgba(255,183,0,0.55)] transition hover:brightness-110 lg:block"
          >
            Simulate Drop
          </button>
        )}

        {isUnlocked && showLast && (
          <div key={killCount} className="osrs-bevel-inset animate-flash-gold bg-osrs-panel-dark/50 p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-osrs-parchment-dark/60">You received</p>
            <div className="flex flex-wrap gap-1.5">
              {lastKill!.drops.map((d, i) => (
                <div
                  key={`${d.item.id}-${i}`}
                  className="animate-drop-pop osrs-bevel-inset flex items-center gap-1 bg-osrs-panel-dark/70 px-1.5 py-1"
                  title={d.item.name}
                >
                  <div className="osrs-orb h-6 w-6 shrink-0 p-0.5" style={orbGlowStyle(SOURCE_GLOW_RGB[d.source] ?? "255,183,0")}>
                    <IconImg src={d.item.iconUrl} alt={d.item.name} className="h-full w-full" />
                  </div>
                  <span className="text-[11px] text-osrs-parchment">
                    {d.item.name}
                    {d.quantity > 1 ? ` x${d.quantity}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {lastKill!.overflow.length > 0 && (
              <p className="mt-1.5 text-[11px] font-semibold text-osrs-red">
                Inventory full: {lastKill!.overflow.map((d) => d.item.name).join(", ")} was not obtained!
              </p>
            )}
          </div>
        )}
        {lastKill && lastKill.drops.length === 0 && (
          <div key={killCount} className="osrs-bevel-inset bg-osrs-panel-dark/50 p-2 text-center text-xs text-osrs-parchment-dark/60">
            Nothing of interest happens.
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden border-t-2 border-osrs-border-dark">
        <p className="bg-osrs-panel-dark/40 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-osrs-parchment-dark/80">
          Drop table
        </p>
        <div className="osrs-scrollbar h-full max-h-[340px] overflow-y-auto pb-4">
          {npc.always.length > 0 && (
            <>
              <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-osrs-parchment-dark/50">
                100% drop
              </p>
              <ul>
                {npc.always.map((e, i) => (
                  <DropRow entry={e} key={`a-${i}`} />
                ))}
              </ul>
            </>
          )}
          {npc.mainTable.length > 0 && (
            <>
              <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-osrs-parchment-dark/50">
                Main drops
              </p>
              <ul>
                {npc.mainTable.map((e, i) => (
                  <DropRow entry={e} key={`m-${i}`} />
                ))}
              </ul>
            </>
          )}
          {npc.tertiary.length > 0 && (
            <>
              <p className="px-2 pt-2 text-[10px] font-semibold uppercase tracking-wide text-osrs-parchment-dark/50">
                Tertiary (rolled separately)
              </p>
              <ul>
                {npc.tertiary.map((e, i) => (
                  <DropRow entry={e} key={`t-${i}`} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
