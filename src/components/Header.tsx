import { formatGp } from "../utils/dropLogic";

interface HeaderProps {
  gp: number;
  totalKills: number;
  uniqueItemsObtained: number;
  onReset: () => void;
  authEnabled: boolean;
  username: string | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
  onOpenLeaderboard: () => void;
}

export default function Header({
  gp,
  totalKills,
  uniqueItemsObtained,
  onReset,
  authEnabled,
  username,
  onOpenAuth,
  onSignOut,
  onOpenLeaderboard,
}: HeaderProps) {
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

      <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-4">
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
        {authEnabled && (
          <button
            onClick={onOpenLeaderboard}
            className="osrs-bevel bg-osrs-panel-dark/50 px-3 py-1.5 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Leaderboard
          </button>
        )}
        {authEnabled && username ? (
          <>
            <span className="hidden text-xs text-osrs-parchment-dark/70 sm:inline">
              Signed in as <span className="font-semibold text-osrs-gold">{username}</span>
            </span>
            <button
              onClick={onSignOut}
              className="osrs-bevel bg-osrs-panel-dark/50 px-3 py-1.5 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
            >
              Sign out
            </button>
          </>
        ) : (
          authEnabled && (
            <button
              onClick={onOpenAuth}
              className="osrs-bevel bg-osrs-gold/20 px-3 py-1.5 text-xs font-semibold text-osrs-gold transition hover:bg-osrs-gold/30 active:osrs-bevel-inset"
            >
              Sign in
            </button>
          )
        )}
        {!username && (
          <button
            onClick={onReset}
            className="osrs-bevel bg-osrs-red/20 px-3 py-1.5 text-xs font-semibold text-osrs-red transition hover:bg-osrs-red/30 active:osrs-bevel-inset"
          >
            Reset
          </button>
        )}
      </div>
    </header>
  );
}
