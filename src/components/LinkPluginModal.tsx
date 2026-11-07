import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

interface Device {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string;
}

interface LinkPluginModalProps {
  onClose: () => void;
}

/** Issues a one-time code the RuneLite plugin trades for a revocable device
 * token (see create_link_code / redeem_link_code). The plugin never sees the
 * player's password or session. */
export default function LinkPluginModal({ onClose }: LinkPluginModalProps) {
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDevices = useCallback(() => {
    supabase?.rpc("list_devices").then(({ data }) => setDevices((data as Device[]) ?? []));
  }, []);

  useEffect(() => {
    loadDevices();
    // A newly linked device shows up here without a manual refresh.
    const t = setInterval(loadDevices, 5000);
    return () => clearInterval(t);
  }, [loadDevices]);

  const newCode = () => {
    setError(null);
    setCopied(false);
    supabase?.rpc("create_link_code").then(({ data, error }) => {
      if (error) setError(error.message);
      else setCode(data);
    });
  };

  const revoke = (id: string) => {
    supabase?.rpc("revoke_device", { p_id: id }).then(loadDevices);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="osrs-bevel osrs-panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-osrs-gold">RuneLite plugin</h2>
          <button
            onClick={onClose}
            className="osrs-bevel bg-osrs-panel-dark/50 px-2 py-1 text-xs font-semibold text-osrs-parchment-dark/80 transition hover:text-osrs-parchment active:osrs-bevel-inset"
          >
            Close
          </button>
        </div>

        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-osrs-parchment-dark/80">
          <li>
            In RuneLite, install <span className="font-semibold text-osrs-parchment">OSRS Drop Simulator</span> from the Plugin Hub.
          </li>
          <li>Open its sidebar panel and go to the Link tab.</li>
          <li>Enter the code below. Your progress is the same in the game and here.</li>
        </ol>

        {code ? (
          <div className="mb-4 text-center">
            <button
              onClick={() => {
                navigator.clipboard?.writeText(code.code).then(() => setCopied(true));
              }}
              className="osrs-bevel-inset w-full bg-osrs-panel-dark/60 py-3 font-mono text-2xl font-bold tracking-[0.3em] text-osrs-gold"
              title="Click to copy"
            >
              {code.code}
            </button>
            <p className="mt-1 text-[11px] text-osrs-parchment-dark/60">
              {copied ? "Copied! " : "Click to copy. "}Works once, expires in 10 minutes.
            </p>
          </div>
        ) : (
          <button
            onClick={newCode}
            className="osrs-cta mb-4 w-full rounded-[9px] bg-gradient-to-b from-osrs-gold to-osrs-orange py-2 text-sm font-bold text-osrs-panel-dark"
          >
            Get a link code
          </button>
        )}
        {error && <p className="mb-3 text-center text-sm text-osrs-red">{error}</p>}

        <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold">Linked devices</h3>
        {devices === null ? (
          <p className="text-xs text-osrs-parchment-dark/60">Loading...</p>
        ) : devices.length === 0 ? (
          <p className="text-xs italic text-osrs-parchment-dark/50">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-osrs-parchment">
                  {d.name}
                  <span className="ml-1 text-osrs-parchment-dark/50">· last used {new Date(d.last_used_at).toLocaleDateString()}</span>
                </span>
                <button onClick={() => revoke(d.id)} className="shrink-0 font-semibold text-osrs-red hover:underline">
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
