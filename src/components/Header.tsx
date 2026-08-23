import { formatGp } from "../utils/dropLogic";

interface HeaderProps {
  gp: number;
  totalKills: number;
  uniqueItemsObtained: number;
  onReset: () => void;
}

export default function Header({ gp, totalKills, uniqueItemsObtained, onReset }: HeaderProps) {
  return (
    <header className="osrs-bevel osrs-panel sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 shadow-lg">
      <div className="flex items-center gap-3">
        <img
          src="https://oldschool.runescape.wiki/images/Old_School_RuneScape_logo.png"
          alt=""
          className="h-9 w-9 object-contain drop-shadow"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div>
          <h1 className="font-display text-xl font-bold tracking-wide text-osrs-gold sm:text-2xl">
            OSRS Drop Simulator
          </h1>
          <p className="text-xs text-osrs-parchment-dark/80">Roll the drop table. Fill your inventory.</p>
        </div>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div
          className="osrs-bevel-inset flex items-center gap-2 bg-osrs-panel-dark/60 px-3 py-1.5"
          title={`${gp.toLocaleString()} coins`}
        >
          <span className="text-osrs-parchment-dark/70">GP:</span>
          <span className="font-semibold text-osrs-gold">{formatGp(gp)}</span>
        </div>
        <div className="osrs-bevel-inset flex items-center gap-2 bg-osrs-panel-dark/60 px-3 py-1.5">
          <span className="text-osrs-parchment-dark/70">Kills:</span>
          <span className="font-semibold text-osrs-gold">{totalKills.toLocaleString()}</span>
        </div>
        <div className="osrs-bevel-inset hidden items-center gap-2 bg-osrs-panel-dark/60 px-3 py-1.5 sm:flex">
          <span className="text-osrs-parchment-dark/70">Unique drops:</span>
          <span className="font-semibold text-osrs-gold">{uniqueItemsObtained}</span>
        </div>
        <button
          onClick={onReset}
          className="osrs-bevel bg-osrs-red/20 px-3 py-1.5 text-xs font-semibold text-osrs-red transition hover:bg-osrs-red/30 active:osrs-bevel-inset"
        >
          Reset
        </button>
      </div>
    </header>
  );
}
