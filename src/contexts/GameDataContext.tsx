import { Component, Suspense, use, type ReactNode } from "react";
import { loadGameData } from "../data/loadGameData";
import { GameDataContext } from "./gameDataContextObject";

const gameDataPromise = loadGameData();

function LoadingScreen() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-osrs-bg px-4 text-center">
      <img
        src="https://oldschool.runescape.wiki/images/Old_School_RuneScape_logo.png"
        alt=""
        className="h-16 w-16 opacity-70"
        onError={(e) => (e.currentTarget.style.display = "none")}
      />
      <p className="font-display text-sm uppercase tracking-widest text-osrs-parchment-dark/70">Loading Gielinor&hellip;</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-osrs-bg px-4 text-center">
      <p className="font-display text-lg text-osrs-red">Couldn't load monster data</p>
      <p className="max-w-xs text-sm text-osrs-parchment-dark/70">{message}</p>
      <button
        onClick={onRetry}
        className="osrs-bevel bg-osrs-gold/20 px-4 py-2 text-sm font-semibold text-osrs-gold transition hover:bg-osrs-gold/30 active:osrs-bevel-inset"
      >
        Retry
      </button>
    </div>
  );
}

class GameDataErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          message={this.state.error.message}
          onRetry={() => {
            // Reloading is the simplest reliable way to retry a rejected
            // top-level promise — `use()` has no built-in re-fetch hook.
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}

function GameDataResolver({ children }: { children: ReactNode }) {
  const data = use(gameDataPromise);
  return <GameDataContext.Provider value={data}>{children}</GameDataContext.Provider>;
}

export function GameDataProvider({ children }: { children: ReactNode }) {
  return (
    <GameDataErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <GameDataResolver>{children}</GameDataResolver>
      </Suspense>
    </GameDataErrorBoundary>
  );
}
