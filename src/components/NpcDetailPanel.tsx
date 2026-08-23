import { useState } from "react";
import { items as allItems, type DropEntry, type Npc } from "../data/npcData";
import type { KillResult } from "../hooks/useGameState";
import { RARITY_STYLES, formatDropRate, formatGp, rarityTier } from "../utils/dropLogic";
import IconImg from "./IconImg";

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
  const item = allItems[entry.itemId];
  if (!item) return null;
  const tier = rarityTier(entry);
  const style = RARITY_STYLES[tier];
  return (
    <li className="flex items-center gap-2 border-b border-osrs-border-dark/40 px-2 py-1.5 last:border-b-0">
      <IconImg src={item.iconUrl} alt={item.name} className="h-7 w-7 shrink-0" />
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
  const [flashKey, setFlashKey] = useState(0);

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
        <IconImg src={npc.iconUrl} alt={npc.name} className="h-14 w-14 shrink-0" />
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
            <button
              onClick={() => onUnlock(npc)}
              disabled={gp < npc.unlockCost}
              className="osrs-bevel mt-1 w-full bg-gradient-to-b from-osrs-red/30 to-osrs-red/10 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-red shadow-md transition hover:from-osrs-red/40 hover:to-osrs-red/20 active:osrs-bevel-inset disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:from-osrs-red/30 disabled:hover:to-osrs-red/10"
            >
              Unlock for {formatGp(npc.unlockCost)} gp
            </button>
            <p className="text-[11px] text-osrs-parchment-dark/50">
              You have {formatGp(gp)} gp
            </p>
          </div>
        ) : (
          <button
            onClick={() => {
              onKill(npc);
              setFlashKey((k) => k + 1);
            }}
            className="osrs-bevel bg-gradient-to-b from-osrs-gold/30 to-osrs-gold/10 py-2.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold shadow-md transition hover:from-osrs-gold/40 hover:to-osrs-gold/20 active:osrs-bevel-inset"
          >
            Simulate Drop
          </button>
        )}

        {isUnlocked && showLast && (
          <div key={flashKey} className="osrs-bevel-inset animate-flash-gold bg-osrs-panel-dark/50 p-2">
            <p className="mb-1 text-[10px] uppercase tracking-wide text-osrs-parchment-dark/60">You received</p>
            <div className="flex flex-wrap gap-1.5">
              {lastKill!.drops.map((d, i) => (
                <div
                  key={`${d.item.id}-${i}`}
                  className="animate-drop-pop osrs-bevel-inset flex items-center gap-1 bg-osrs-panel-dark/70 px-1.5 py-1"
                  title={d.item.name}
                >
                  <IconImg src={d.item.iconUrl} alt={d.item.name} className="h-6 w-6" />
                  <span className="text-[11px] text-osrs-parchment">
                    {d.item.name}
                    {d.quantity > 1 ? ` x${d.quantity}` : ""}
                  </span>
                </div>
              ))}
            </div>
            {lastKill!.overflow.length > 0 && (
              <p className="mt-1.5 text-[11px] font-semibold text-osrs-red">
                Inventory full &mdash; {lastKill!.overflow.map((d) => d.item.name).join(", ")} was not obtained!
              </p>
            )}
          </div>
        )}
        {lastKill && lastKill.drops.length === 0 && (
          <div key={flashKey} className="osrs-bevel-inset bg-osrs-panel-dark/50 p-2 text-center text-xs text-osrs-parchment-dark/60">
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
