import { lazy, Suspense, useState } from "react";
import AdBanner from "./components/AdBanner";
import DropLogPanel from "./components/DropLogPanel";
import Header from "./components/Header";
import InventoryGrid from "./components/InventoryGrid";
import NpcBrowser from "./components/NpcBrowser";
import NpcDetailPanel from "./components/NpcDetailPanel";
import { useGameData } from "./hooks/useGameData";
import type { Npc } from "./data/npcData";
import { useAuth } from "./hooks/useAuth";
import { useGameState } from "./hooks/useGameState";

// Only mounted on demand (modals/overlays) — lazy-loaded so first paint
// doesn't have to wait on code most visitors won't need this session.
const AuthModal = lazy(() => import("./components/AuthModal"));
const ConfirmModal = lazy(() => import("./components/ConfirmModal"));
const ContainerModal = lazy(() => import("./components/ContainerModal"));
const Leaderboard = lazy(() => import("./components/Leaderboard"));
const UnlockCelebration = lazy(() => import("./components/UnlockCelebration"));

function App() {
  const { npcs } = useGameData();
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(npcs[0] ?? null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [celebratingNpc, setCelebratingNpc] = useState<Npc | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const auth = useAuth();
  const game = useGameState(auth.userId);
  const isSelectedUnlocked = selectedNpc ? game.unlockedNpcIds.has(selectedNpc.id) : false;
  const authModalOpen = showAuth || auth.needsUsername;

  const handleUnlock = (npc: Npc) => {
    if (game.unlockNpc(npc)) {
      setCelebratingNpc(npc);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div className="px-4 pt-4">
        <Header
          gp={game.gp}
          totalKills={game.totalKills}
          uniqueItemsObtained={game.uniqueItemsObtained}
          onReset={() => setShowResetConfirm(true)}
          authEnabled={auth.enabled}
          username={auth.username}
          onOpenAuth={() => setShowAuth(true)}
          onSignOut={auth.signOut}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
        />
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 items-start justify-center gap-4 px-4 py-4">
        <AdBanner variant="skyscraper-left" />

        <main className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:h-[720px] lg:grid-cols-12">
          <div className="min-h-[420px] lg:col-span-3 lg:h-full">
            <NpcBrowser
              selectedNpcId={selectedNpc?.id ?? null}
              onSelect={setSelectedNpc}
              killCounts={game.killCounts}
              unlockedNpcIds={game.unlockedNpcIds}
            />
          </div>

          <div className="flex min-h-[520px] flex-col gap-4 lg:col-span-5 lg:h-full">
            <div className="min-h-0 flex-1">
              <NpcDetailPanel
                npc={selectedNpc}
                killCount={selectedNpc ? game.killCounts[selectedNpc.id] ?? 0 : 0}
                lastKill={game.lastKill}
                isUnlocked={isSelectedUnlocked}
                gp={game.gp}
                onKill={game.simulateKill}
                onUnlock={handleUnlock}
              />
            </div>
            {selectedNpc && !isSelectedUnlocked && <AdBanner variant="rectangle" className="shrink-0" />}
          </div>

          <div className="flex min-h-[600px] flex-col gap-4 lg:col-span-4 lg:h-full">
            <div className="min-h-[340px] flex-[1.3]">
              <InventoryGrid
                inventory={game.inventory}
                onMove={game.moveItem}
                onRemove={game.removeItem}
                onSell={game.sellItem}
                onSellAll={game.sellAll}
                onClear={game.clearInventory}
                onOpen={game.openContainer}
              />
            </div>
            <div className="min-h-[220px] flex-1">
              <DropLogPanel log={game.log} />
            </div>
          </div>
        </main>

        <AdBanner variant="skyscraper-right" />
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 pb-4">
        <AdBanner variant="leaderboard" />
      </div>

      <footer className="mt-auto px-4 pb-4 text-center text-[11px] text-osrs-parchment-dark/40">
        Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy.
        This content is not endorsed by or affiliated with Jagex.
      </footer>

      <Suspense fallback={null}>
        {showResetConfirm && (
          <ConfirmModal
            title="Reset all progress?"
            message="This wipes your GP, inventory, kill counts, and every monster you've unlocked. This can't be undone."
            confirmLabel="Reset everything"
            onCancel={() => setShowResetConfirm(false)}
            onConfirm={() => {
              game.resetAll();
              setShowResetConfirm(false);
            }}
          />
        )}

        {game.lastContainerOpen && (
          <ContainerModal result={game.lastContainerOpen} onClose={game.closeContainerModal} />
        )}

        {celebratingNpc && (
          <UnlockCelebration npc={celebratingNpc} onDismiss={() => setCelebratingNpc(null)} />
        )}

        {authModalOpen && (
          <AuthModal
            auth={auth}
            onClose={() => setShowAuth(false)}
          />
        )}

        {showLeaderboard && (
          <Leaderboard currentUsername={auth.username} onClose={() => setShowLeaderboard(false)} />
        )}
      </Suspense>
    </div>
  );
}

export default App;
