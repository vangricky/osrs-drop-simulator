import { useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "../lib/supabase";
import { formatGp } from "../utils/dropLogic";

type Tab = "gp" | "prestige";

interface LeaderboardRow {
  username: string;
  gp: number;
  prestige_count: number;
  updated_at: string;
}

interface LeaderboardProps {
  currentUsername: string | null;
  onClose: () => void;
}

export default function Leaderboard({ currentUsername, onClose }: LeaderboardProps) {
  const [tab, setTab] = useState<Tab>("gp");
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let query = supabase.from("leaderboard").select("username, gp, prestige_count, updated_at");
    query =
      tab === "gp"
        ? query.order("gp", { ascending: false })
        : query.order("prestige_count", { ascending: false }).order("gp", { ascending: false });
    query.limit(100).then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data ?? []);
    });
  }, [tab]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="osrs-bevel osrs-panel flex max-h-[80vh] w-full max-w-md flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-osrs-gold">Leaderboard</h2>
          <button
            onClick={onClose}
            className="osrs-bevel bg-osrs-panel-dark/50 px-2 py-1 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Close
          </button>
        </div>

        <div className="mb-3 flex gap-1">
          <button
            onClick={() => {
              setTab("gp");
              setRows(null);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${tab === "gp" ? "osrs-bevel-inset bg-osrs-gold/15 text-osrs-gold" : "text-osrs-parchment-dark/70"}`}
          >
            Richest
          </button>
          <button
            onClick={() => {
              setTab("prestige");
              setRows(null);
              setError(null);
            }}
            className={`flex-1 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${tab === "prestige" ? "osrs-bevel-inset bg-osrs-gold/15 text-osrs-gold" : "text-osrs-parchment-dark/70"}`}
          >
            Most prestiges
          </button>
        </div>

        {!supabaseEnabled && (
          <p className="text-center text-sm text-osrs-parchment-dark/60">
            The leaderboard needs an account. Sign in to see it and take your spot.
          </p>
        )}

        {supabaseEnabled && error && <p className="text-center text-sm text-osrs-red">{error}</p>}

        {supabaseEnabled && !error && rows === null && (
          <p className="text-center text-sm text-osrs-parchment-dark/60">Loading...</p>
        )}

        {supabaseEnabled && rows && rows.length === 0 && (
          <p className="text-center text-sm text-osrs-parchment-dark/60">
            No one's on the board yet. Be the first.
          </p>
        )}

        {rows && rows.length > 0 && (
          <ol className="osrs-scrollbar min-h-0 flex-1 overflow-y-auto">
            {rows.map((row, i) => {
              const isMe = row.username === currentUsername;
              return (
                <li
                  key={row.username}
                  className={`flex items-center gap-3 border-b border-osrs-border-dark/40 px-1 py-2 last:border-b-0 ${
                    isMe ? "osrs-bevel-inset bg-osrs-gold/10" : ""
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-right text-xs font-bold ${
                      i === 0 ? "text-osrs-gold" : i === 1 ? "text-osrs-parchment" : i === 2 ? "text-osrs-orange" : "text-osrs-parchment-dark/60"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${isMe ? "font-bold text-osrs-gold" : "text-osrs-parchment"}`}>
                    {row.username}
                    {isMe && <span className="ml-1 text-[10px] text-osrs-parchment-dark/60">(you)</span>}
                  </span>
                  {tab === "gp" ? (
                    <span className="shrink-0 text-sm font-semibold text-osrs-gold">{formatGp(row.gp)} gp</span>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold text-osrs-gold">
                      {row.prestige_count} {row.prestige_count === 1 ? "prestige" : "prestiges"}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
