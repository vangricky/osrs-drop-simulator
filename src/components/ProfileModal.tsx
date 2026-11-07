import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useGameData } from "../hooks/useGameData";
import { sortBadges } from "../data/badges";
import { formatGp } from "../utils/dropLogic";
import IconImg from "./IconImg";

interface Profile {
  username: string;
  joined: string;
  prestige_count: number;
  lifetime_value: number;
  week_value: number;
  total_kills: number;
  clog_slots: number;
  gp: number;
  unlocked_count: number;
  kill_counts: Record<string, number>;
  badges: { id: string; earned_at: string }[];
  weekly_titles: number;
  rank_overall: number | null;
  rank_weekly: number | null;
  rank_clog: number | null;
  best_drops: { item_id: string; name: string; value: number; is_pet: boolean; source_name: string; source_count: number; timestamp: number }[];
}

interface ProfileModalProps {
  username: string;
  onClose: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="osrs-bevel-inset bg-osrs-panel-dark/40 px-2 py-1.5 text-center">
      <div className="text-sm font-bold text-osrs-gold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-osrs-parchment-dark/60">{label}</div>
    </div>
  );
}

export default function ProfileModal({ username, onClose }: ProfileModalProps) {
  const { npcs, items } = useGameData();
  const npcName = useMemo(() => Object.fromEntries(npcs.map((n) => [n.id, n.name])), [npcs]);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("get_profile", { p_username: username }).then(({ data }) => setProfile((data as Profile) ?? null));
  }, [username]);

  const badgeDefs = profile ? sortBadges(profile.badges.map((b) => b.id)) : [];
  const topKills = profile
    ? Object.entries(profile.kill_counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
    : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="osrs-bevel osrs-panel osrs-scrollbar flex max-h-[85vh] w-full max-w-md flex-col overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-osrs-gold">{profile?.username ?? username}</h2>
          <button
            onClick={onClose}
            className="osrs-bevel bg-osrs-panel-dark/50 px-2 py-1 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Close
          </button>
        </div>

        {profile === undefined && <p className="text-center text-sm text-osrs-parchment-dark/60">Loading...</p>}
        {profile === null && <p className="text-center text-sm text-osrs-parchment-dark/60">No player with that name.</p>}

        {profile && (
          <>
            <p className="mb-3 text-xs text-osrs-parchment-dark/60">
              {profile.prestige_count > 0 ? `Prestige ${profile.prestige_count} · ` : ""}
              {profile.unlocked_count} bosses unlocked · playing since {new Date(profile.joined).toLocaleDateString()}
            </p>

            <div className="mb-3 grid grid-cols-3 gap-1.5">
              <Stat label="Overall rank" value={profile.rank_overall ? `#${profile.rank_overall}` : "-"} />
              <Stat label="Weekly rank" value={profile.rank_weekly ? `#${profile.rank_weekly}` : "-"} />
              <Stat label="Log rank" value={profile.rank_clog ? `#${profile.rank_clog}` : "-"} />
              <Stat label="Lifetime loot" value={formatGp(Number(profile.lifetime_value))} />
              <Stat label="Total kills" value={Number(profile.total_kills).toLocaleString()} />
              <Stat label="Log slots" value={String(profile.clog_slots)} />
            </div>

            <h3 className="mb-1.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold">Badges</h3>
            {badgeDefs.length === 0 ? (
              <p className="mb-3 text-xs italic text-osrs-parchment-dark/50">No badges yet.</p>
            ) : (
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {badgeDefs.map((b) => {
                  const earned = profile.badges.find((x) => x.id === b.id);
                  return (
                    <div key={b.id} className="osrs-bevel-inset flex items-center gap-2 bg-osrs-panel-dark/40 p-1.5" title={b.description}>
                      <IconImg src={b.icon} alt={b.name} className="h-8 w-8 shrink-0" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-osrs-parchment">
                          {b.name}
                          {b.id === "weekly-champion" && profile.weekly_titles > 1 ? ` x${profile.weekly_titles}` : ""}
                        </div>
                        {earned && <div className="text-[10px] text-osrs-parchment-dark/50">{new Date(earned.earned_at).toLocaleDateString()}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <h3 className="mb-1.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold">Best drops</h3>
            {profile.best_drops.length === 0 ? (
              <p className="mb-3 text-xs italic text-osrs-parchment-dark/50">Nothing yet.</p>
            ) : (
              <ul className="mb-3 space-y-1">
                {profile.best_drops.map((d) => (
                  <li key={d.item_id} className="flex items-center gap-2 text-xs">
                    <IconImg src={items[d.item_id]?.iconUrl ?? ""} alt={d.name} className="h-6 w-6 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-osrs-parchment">
                      {d.name}
                      {d.is_pet && <span className="ml-1 text-osrs-orange">(pet)</span>}
                    </span>
                    <span className="shrink-0 text-osrs-parchment-dark/60">
                      {d.source_name} #{Number(d.source_count).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {topKills.length > 0 && (
              <>
                <h3 className="mb-1.5 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold">Most killed</h3>
                <ul className="space-y-0.5">
                  {topKills.map(([id, kc]) => (
                    <li key={id} className="flex justify-between text-xs">
                      <span className="text-osrs-parchment">{npcName[id] ?? id}</span>
                      <span className="text-osrs-parchment-dark/70">{Number(kc).toLocaleString()} kc</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
