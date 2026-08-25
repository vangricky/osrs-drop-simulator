import { lazy, Suspense, useState } from "react";
import DropLogPanel from "./components/DropLogPanel";
import Header from "./components/Header";
import InventoryGrid from "./components/InventoryGrid";
import MobileSimulateBar from "./components/MobileSimulateBar";
import NpcBrowser from "./components/NpcBrowser";
import NpcDetailPanel from "./components/NpcDetailPanel";
import { useGameData } from "./hooks/useGameData";
import type { Npc } from "./data/npcData";
import { useAuth } from "./hooks/useAuth";
import { useGameState } from "./hooks/useGameState";

// Only mounted on demand (modals/overlays) — lazy-loaded so first paint
// doesn't have to wait on code most visitors won't need this session.
const AuthModal = lazy(() => import("./components/AuthModal"));
const CollectionLogModal = lazy(() => import("./components/CollectionLogModal"));
const ConfirmModal = lazy(() => import("./components/ConfirmModal"));
const ContainerModal = lazy(() => import("./components/ContainerModal"));
const HowToPlayModal = lazy(() => import("./components/HowToPlayModal"));
const Leaderboard = lazy(() => import("./components/Leaderboard"));
const PrestigeCelebration = lazy(() => import("./components/PrestigeCelebration"));
const UnlockCelebration = lazy(() => import("./components/UnlockCelebration"));

// Below lg, the page shows one panel at a time (tabs) instead of stacking
// all of them, since a phone screen can't fit boss browser + kill panel +
// inventory + log without forcing the whole page to scroll. At lg+ this is
// ignored entirely — every panel is shown at once in the 3-column layout.
const MOBILE_TABS = [
  { key: "bosses", label: "Bosses" },
  { key: "detail", label: "Kill" },
  { key: "inventory", label: "Inventory" },
] as const;
type MobileTab = (typeof MOBILE_TABS)[number]["key"];

const LAST_NPC_STORAGE_KEY = "osrs-drop-sim-last-npc-v1";

function App() {
  const { npcs } = useGameData();
  const [mobileTab, setMobileTab] = useState<MobileTab>("detail");
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [celebratingNpc, setCelebratingNpc] = useState<Npc | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCollectionLog, setShowCollectionLog] = useState(false);
  const [showPrestigeConfirm, setShowPrestigeConfirm] = useState(false);
  const [celebratingPrestige, setCelebratingPrestige] = useState<number | null>(null);
  const auth = useAuth();
  const game = useGameState(auth.userId);
  // Defaults to whichever boss this browser last had selected (so a reload
  // doesn't dump the player back on a random/locked boss), falling back to
  // the first unlocked one if there's no stored pick, the stored pick no
  // longer exists, or it's since become locked — never to an arbitrary
  // (possibly high-level, locked) npcs[0].
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(() => {
    const lastId = localStorage.getItem(LAST_NPC_STORAGE_KEY);
    const last = lastId ? npcs.find((n) => n.id === lastId) : undefined;
    if (last && game.unlockedNpcIds.has(last.id)) return last;
    // No usable stored pick — fall back to the easiest unlocked boss (same
    // combat-level-ascending order NpcBrowser lists them in) rather than
    // npcs[0], which is raw data-pipeline order and can land on something
    // like King Black Dragon.
    const byLevel = [...npcs].sort((a, b) => a.combatLevel - b.combatLevel);
    return byLevel.find((n) => game.unlockedNpcIds.has(n.id)) ?? npcs[0] ?? null;
  });
  const isSelectedUnlocked = selectedNpc ? game.unlockedNpcIds.has(selectedNpc.id) : false;
  const authModalOpen = showAuth || auth.needsUsername;

  // Jumping to a boss from the browser should also jump straight to its kill
  // panel on mobile — otherwise picking a boss would silently do nothing
  // until the player noticed they had to switch tabs themselves. No-op cost
  // at lg+, where the tabs aren't shown at all.
  const handleSelectNpc = (npc: Npc) => {
    setSelectedNpc(npc);
    localStorage.setItem(LAST_NPC_STORAGE_KEY, npc.id);
    setMobileTab("detail");
  };

  const handleUnlock = (npc: Npc) => {
    if (game.unlockNpc(npc)) {
      setCelebratingNpc(npc);
    }
  };

  const handlePrestige = async () => {
    setShowPrestigeConfirm(false);
    const newCount = await game.prestige();
    if (newCount !== null) setCelebratingPrestige(newCount);
  };

  return (
    // The whole page is a fixed-height app shell (h-dvh + overflow-hidden on
    // html/body/#root, see index.css) — it never scrolls itself. Every panel
    // that can outgrow its space scrolls internally instead, so nothing here
    // needs bottom padding to "make room" for anything below it.
    <div className="flex h-dvh flex-col overflow-hidden">
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
        onOpenHowToPlay={() => setShowHowToPlay(true)}
        onOpenCollectionLog={() => setShowCollectionLog(true)}
        prestigeCount={game.prestigeCount}
        canPrestige={game.canPrestige}
        unlockedNpcCount={game.unlockedNpcIds.size}
        totalNpcCount={game.totalNpcCount}
        onOpenPrestige={() => setShowPrestigeConfirm(true)}
      />

      {/* Widened from the old 1600px cap now that the side ad columns are
          gone — the three panels stretch to use the reclaimed width instead
          of leaving it empty on large screens. */}
      <div className="mx-auto flex w-full min-h-0 max-w-[1920px] flex-1 items-stretch justify-center gap-3 px-4 py-4">
        <main className="flex min-w-0 flex-1 min-h-0 flex-col gap-2 lg:grid lg:grid-cols-12 lg:gap-3">
          {/* Below lg: one panel visible at a time, switched by these tabs.
              At lg+ every panel is shown at once, so this row doesn't render. */}
          <div className="flex shrink-0 gap-1 lg:hidden" role="tablist" aria-label="Panel">
            {MOBILE_TABS.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={mobileTab === tab.key}
                onClick={() => setMobileTab(tab.key)}
                className={`flex-1 px-2 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  mobileTab === tab.key
                    ? "osrs-bevel-inset bg-osrs-gold/15 text-osrs-gold"
                    : "osrs-bevel bg-osrs-panel-dark/50 text-osrs-parchment-dark/70 active:osrs-bevel-inset"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div
            className={`min-h-0 min-w-0 flex-1 lg:col-span-3 lg:flex lg:h-full ${mobileTab === "bosses" ? "flex" : "hidden"}`}
          >
            <NpcBrowser
              selectedNpcId={selectedNpc?.id ?? null}
              onSelect={handleSelectNpc}
              killCounts={game.killCounts}
              unlockedNpcIds={game.unlockedNpcIds}
            />
          </div>

          <div
            className={`min-h-0 min-w-0 flex-1 flex-col gap-4 lg:col-span-5 lg:flex lg:h-full ${mobileTab === "detail" ? "flex" : "hidden"}`}
          >
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
          </div>

          <div
            className={`min-h-0 min-w-0 flex-1 flex-col gap-4 lg:col-span-4 lg:flex lg:h-full ${mobileTab === "inventory" ? "flex" : "hidden"}`}
          >
            <div className="min-h-0 flex-[1.3]">
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
            <div className="min-h-0 flex-1">
              <DropLogPanel log={game.log} />
            </div>
          </div>
        </main>
      </div>

      <footer className="shrink-0 px-4 py-1.5 text-center text-[11px] text-osrs-parchment-dark/40">
        Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy.
        This content is not endorsed by or affiliated with Jagex.
      </footer>

      {/* Reserves the room MobileSimulateBar's fixed bottom bar (lg:hidden)
          occupies, so it overlays blank space instead of the footer. */}
      <div className="h-20 shrink-0 lg:hidden" aria-hidden="true" />

      <MobileSimulateBar
        npc={selectedNpc}
        isUnlocked={isSelectedUnlocked}
        gp={game.gp}
        onKill={game.simulateKill}
        onUnlock={handleUnlock}
      />

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

        {showPrestigeConfirm && (
          <ConfirmModal
            title="Prestige?"
            message="Every monster is unlocked. Prestiging resets your GP, inventory, kill counts, and unlocked monsters back to the start, and adds 1 to your prestige count on the leaderboard. This can't be undone."
            confirmLabel="Prestige"
            onCancel={() => setShowPrestigeConfirm(false)}
            onConfirm={handlePrestige}
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

        {showHowToPlay && <HowToPlayModal onClose={() => setShowHowToPlay(false)} />}

        {showCollectionLog && (
          <CollectionLogModal
            collectionLog={game.collectionLog}
            collectionLogFirsts={game.collectionLogFirsts}
            onClose={() => setShowCollectionLog(false)}
          />
        )}

        {celebratingPrestige !== null && (
          <PrestigeCelebration prestigeCount={celebratingPrestige} onDismiss={() => setCelebratingPrestige(null)} />
        )}
      </Suspense>
    </div>
  );
}

export default App;
