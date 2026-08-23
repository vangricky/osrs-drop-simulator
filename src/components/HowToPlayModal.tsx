interface HowToPlayModalProps {
  onClose: () => void;
}

interface Step {
  title: string;
  body: string;
  iconUrl: string;
  iconAlt: string;
}

const STEPS: Step[] = [
  {
    title: "1. Pick a monster",
    body: "Browse or search the monster list on the left. Low-level monsters (under combat level 10) are free to fight. Tougher ones cost GP to unlock.",
    iconUrl: "https://oldschool.runescape.wiki/images/Coins_10000.png",
    iconAlt: "Coins",
  },
  {
    title: "2. Simulate a kill",
    body: "Hit Simulate drop. Guaranteed drops always show up, one main-table item rolls per kill, and rare tertiary drops (clue scrolls, pets) roll independently. Real drop rates, every time.",
    iconUrl: "https://oldschool.runescape.wiki/images/Clue_scroll_(master).png",
    iconAlt: "Clue scroll",
  },
  {
    title: "3. Manage your loot",
    body: "Loot lands in your 28-slot inventory. Sell it straight from there, or open containers like clue caskets for a shot at bonus rewards.",
    iconUrl: "https://oldschool.runescape.wiki/images/Blue_partyhat.png",
    iconAlt: "Blue partyhat",
  },
  {
    title: "4. Cash in & level up",
    body: "Spend your GP unlocking stronger monsters with better drop tables. Chase the rares and work your way up to the bosses.",
    iconUrl: "https://oldschool.runescape.wiki/images/Twisted_bow.png",
    iconAlt: "Twisted bow",
  },
  {
    title: "5. Prestige",
    body: "Unlock every monster, bosses included, and the Prestige button lights up. It resets your GP, inventory, and unlocks back to the start, and adds 1 to a permanent prestige count with its own leaderboard tab.",
    iconUrl: "https://oldschool.runescape.wiki/images/Max_cape.png",
    iconAlt: "Max cape",
  },
];

export default function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="osrs-bevel osrs-panel flex max-h-[85vh] w-full max-w-lg flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="https://oldschool.runescape.wiki/images/Old_School_RuneScape_logo.png"
              alt=""
              className="h-8 w-8 object-contain drop-shadow"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <h2 className="font-display text-lg font-bold text-osrs-gold">How to play</h2>
          </div>
          <button
            onClick={onClose}
            className="osrs-bevel bg-osrs-panel-dark/50 px-2 py-1 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-xs text-osrs-parchment-dark/70">
          A drop-rate simulator built on real Old School RuneScape data. No grinding required.
        </p>

        <div className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {STEPS.map((step) => (
              <div key={step.title} className="osrs-bevel-inset flex items-center gap-3 bg-osrs-panel-dark/50 p-3">
                <img
                  src={step.iconUrl}
                  alt={step.iconAlt}
                  className="h-10 w-10 shrink-0 object-contain drop-shadow"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
                <div className="min-w-0">
                  <h3 className="font-display text-sm font-bold text-osrs-gold">{step.title}</h3>
                  <p className="text-xs text-osrs-parchment-dark/80">{step.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="osrs-bevel-inset mt-3 bg-osrs-panel-dark/50 p-3 text-xs text-osrs-parchment-dark/80">
            <span className="font-semibold text-osrs-gold">Tip:</span> sign in (top-right or menu) to save your
            progress to the cloud and put your GP on the public leaderboard. You can always keep playing as a
            guest instead. Progress just stays on this device.
          </div>
        </div>

        <button
          onClick={onClose}
          className="osrs-bevel mt-4 w-full bg-gradient-to-b from-osrs-gold/30 to-osrs-gold/10 py-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold transition hover:from-osrs-gold/40 hover:to-osrs-gold/20 active:osrs-bevel-inset"
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  );
}
