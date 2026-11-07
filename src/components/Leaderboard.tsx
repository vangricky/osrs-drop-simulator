import { useEffect, useMemo, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { useGameData } from "../hooks/useGameData";
import { formatGp } from "../utils/dropLogic";
import BadgeRow from "./BadgeRow";
import ProfileModal from "./ProfileModal";

type Tab = "overall" | "weekly" | "clog" | "boss";

const TABS: { key: Tab; label: string }[] = [
  { key: "overall", label: "Overall" },
  { key: "weekly", label: "This week" },
  { key: "clog", label: "Coll. log" },
  { key: "boss", label: "Boss KC" },
];

interface Row {
  rank: number;
  username: string;
  prestige_count: number;
  badges: string[];
  /** The number this tab ranks by. */
  score: number;
  /** Secondary detail under the name. */
  detail?: string;
}

interface LeaderboardProps {
  currentUsername: string | null;
  onClose: () => void;
}

function useCountdown(endsAt: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!endsAt) return "";
  const ms = Math.max(0, new Date(endsAt).getTime() - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
}

export default function Leaderboard({ currentUsername, onClose }: LeaderboardProps) {
  const { npcs } = useGameData();
  const bosses = useMemo(() => [...npcs].sort((a, b) => a.name.localeCompare(b.name)), [npcs]);
  const [tab, setTab] = useState<Tab>("overall");
  const [bossId, setBossId] = useState<string>(() => bosses[0]?.id ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [season, setSeason] = useState<{ ends_at: string; past_champions: { username: string; value: number; week_start: string }[] } | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const countdown = useCountdown(season?.ends_at ?? null);

  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("get_season_info").then(({ data }) => data && setSeason(data));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const done = (data: Row[] | null, err: { message: string } | null) => {
      if (cancelled) return;
      if (err) setError(err.message);
      else setRows(data ?? []);
    };

    if (tab === "overall") {
      supabase.from("leaderboard_overall").select("*").order("rank").limit(100).then(({ data, error }) =>
        done(
          (data ?? []).map((r) => ({ ...r, score: Number(r.lifetime_value), detail: `${Number(r.total_kills).toLocaleString()} kills · ${r.clog_slots} log slots` })),
          error,
        ),
      );
    } else if (tab === "weekly") {
      supabase.from("leaderboard_weekly").select("*").order("rank").limit(100).then(({ data, error }) =>
        done((data ?? []).map((r) => ({ ...r, score: Number(r.week_value) })), error),
      );
    } else if (tab === "clog") {
      supabase.from("leaderboard_clog").select("*").order("rank").limit(100).then(({ data, error }) =>
        done((data ?? []).map((r) => ({ ...r, score: Number(r.clog_slots) })), error),
      );
    } else if (bossId) {
      type BossRow = Omit<Row, "score"> & { kills: number };
      supabase.rpc("get_boss_leaderboard", { p_npc_id: bossId }).then(({ data, error }) =>
        done(((data as BossRow[] | null) ?? []).map((r) => ({ ...r, score: Number(r.kills) })), error),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [tab, bossId]);

  const scoreLabel = (r: Row) => {
    if (tab === "overall") return `${formatGp(r.score)} loot`;
    if (tab === "weekly") return `${formatGp(r.score)} loot`;
    if (tab === "clog") return `${r.score} slots`;
    return `${r.score.toLocaleString()} kc`;
  };

  const me = rows?.find((r) => r.username === currentUsername);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="osrs-bevel osrs-panel flex max-h-[85vh] w-full max-w-lg flex-col p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-osrs-gold">Leaderboard</h2>
          <button
            onClick={onClose}
            className="osrs-bevel bg-osrs-panel-dark/50 px-2 py-1 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Close
          </button>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                if (t.key === tab) return;
                setRows(null);
                setError(null);
                setTab(t.key);
              }}
              className={`py-1.5 text-[11px] font-semibold uppercase tracking-wide transition ${tab === t.key ? "osrs-bevel-inset bg-osrs-gold/15 text-osrs-gold" : "text-osrs-parchment-dark/70 hover:text-osrs-parchment"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overall" && (
          <p className="mb-2 text-xs text-osrs-parchment-dark/60">
            Ranked by prestige, then the total value of everything you've ever looted. Spending GP never lowers your rank.
          </p>
        )}
        {tab === "weekly" && (
          <div className="mb-2 text-xs text-osrs-parchment-dark/60">
            Loot value this week. Resets every Monday 00:00 UTC
            {countdown && <span className="font-semibold text-osrs-gold"> · ends in {countdown}</span>}. The #1 player earns the
            permanent Weekly Champion badge.
            {season && season.past_champions.length > 0 && (
              <div className="mt-1">
                Last champion: <span className="font-semibold text-osrs-parchment">{season.past_champions[0].username}</span> (
                {formatGp(Number(season.past_champions[0].value))})
              </div>
            )}
          </div>
        )}
        {tab === "clog" && <p className="mb-2 text-xs text-osrs-parchment-dark/60">Unique items ever obtained. Survives prestige.</p>}
        {tab === "boss" && (
          <select
            value={bossId}
            onChange={(e) => {
              setRows(null);
              setError(null);
              setBossId(e.target.value);
            }}
            className="osrs-bevel-inset mb-2 w-full bg-osrs-panel-dark/60 px-2 py-1.5 text-sm text-osrs-parchment"
          >
            {bosses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        {!supabaseEnabled && (
          <p className="text-center text-sm text-osrs-parchment-dark/60">The leaderboard needs an account. Sign in to see it and take your spot.</p>
        )}
        {supabaseEnabled && error && <p className="text-center text-sm text-osrs-red">{error}</p>}
        {supabaseEnabled && !error && rows === null && <p className="text-center text-sm text-osrs-parchment-dark/60">Loading...</p>}
        {supabaseEnabled && rows && rows.length === 0 && (
          <p className="text-center text-sm text-osrs-parchment-dark/60">No one's on this board yet. Be the first.</p>
        )}

        {rows && rows.length > 0 && (
          <ol className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto">
            {rows.map((row) => {
              const isMe = row.username === currentUsername;
              return (
                <li key={row.username}>
                  <button
                    onClick={() => setProfile(row.username)}
                    className={`flex w-full items-center gap-3 border-b border-osrs-border-dark/40 px-1 py-2 text-left transition last:border-b-0 hover:bg-osrs-gold/5 ${
                      isMe ? "osrs-bevel-inset bg-osrs-gold/10" : ""
                    }`}
                  >
                    <span
                      className={`w-7 shrink-0 text-right text-xs font-bold ${
                        row.rank === 1 ? "text-osrs-gold" : row.rank === 2 ? "text-osrs-parchment" : row.rank === 3 ? "text-osrs-orange" : "text-osrs-parchment-dark/60"
                      }`}
                    >
                      {row.rank}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`flex items-center gap-1.5 truncate text-sm ${isMe ? "font-bold text-osrs-gold" : "text-osrs-parchment"}`}>
                        <span className="truncate">{row.username}</span>
                        <BadgeRow badges={row.badges ?? []} />
                        {isMe && <span className="text-[10px] text-osrs-parchment-dark/60">(you)</span>}
                      </span>
                      {row.detail && <span className="block truncate text-[11px] text-osrs-parchment-dark/50">{row.detail}</span>}
                    </span>
                    <span className="shrink-0 text-right text-sm font-semibold text-osrs-gold">
                      {scoreLabel(row)}
                      {row.prestige_count > 0 && tab === "overall" && (
                        <span className="block text-[10px] font-normal text-osrs-parchment-dark/60">Prestige {row.prestige_count}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {currentUsername && rows && rows.length > 0 && !me && (
          <p className="mt-2 text-center text-xs text-osrs-parchment-dark/60">You're not on this board yet. Get killing!</p>
        )}
      </div>

      {profile && <ProfileModal username={profile} onClose={() => setProfile(null)} />}
    </div>
  );
}
