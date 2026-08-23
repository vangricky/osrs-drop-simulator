import { useRef, useState } from "react";
import type { useAuth } from "../hooks/useAuth";
import TurnstileWidget, { type TurnstileHandle } from "./TurnstileWidget";
import { turnstileConfigured } from "../lib/turnstile";

interface AuthModalProps {
  auth: ReturnType<typeof useAuth>;
  onClose: () => void;
}

function UsernameStep({ auth, onClose }: AuthModalProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
      setError("3-20 characters: letters, numbers, underscore only.");
      return;
    }
    setBusy(true);
    try {
      await auth.claimUsername(name);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not claim that username.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="osrs-bevel osrs-panel w-full max-w-sm p-5 text-center" onClick={(e) => e.stopPropagation()}>
      <h2 className="mb-2 font-display text-lg font-bold text-osrs-gold">Choose your username</h2>
      <p className="mb-4 text-xs text-osrs-parchment-dark/70">This is what shows on the public leaderboard.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Username"
        maxLength={20}
        className="osrs-bevel-inset w-full bg-osrs-panel-dark/70 px-3 py-2 text-sm text-osrs-parchment placeholder:text-osrs-parchment-dark/50 focus:outline-none"
      />
      {error && <p className="mt-2 text-xs font-semibold text-osrs-red">{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="osrs-bevel mt-4 w-full bg-gradient-to-b from-osrs-gold/30 to-osrs-gold/10 py-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold transition hover:from-osrs-gold/40 hover:to-osrs-gold/20 active:osrs-bevel-inset disabled:opacity-50"
      >
        {busy ? "Saving..." : "Start playing"}
      </button>
    </div>
  );
}

function SignInStep({ auth, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const submit = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "in") {
        await auth.signIn(email, password, captchaToken ?? undefined);
        onClose();
      } else {
        await auth.signUp(email, password, captchaToken ?? undefined);
        setNotice("Check your email to confirm your account, then sign in.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      // Turnstile tokens are single-use — a fresh one is needed for any retry.
      turnstileRef.current?.reset();
    }
  };

  return (
    <div className="osrs-bevel osrs-panel w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
      <div className="mb-4 flex gap-1">
        <button
          onClick={() => setMode("in")}
          className={`flex-1 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${mode === "in" ? "osrs-bevel-inset bg-osrs-gold/15 text-osrs-gold" : "text-osrs-parchment-dark/70"}`}
        >
          Sign in
        </button>
        <button
          onClick={() => setMode("up")}
          className={`flex-1 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${mode === "up" ? "osrs-bevel-inset bg-osrs-gold/15 text-osrs-gold" : "text-osrs-parchment-dark/70"}`}
        >
          Create account
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="osrs-bevel-inset w-full bg-osrs-panel-dark/70 px-3 py-2 text-sm text-osrs-parchment placeholder:text-osrs-parchment-dark/50 focus:outline-none"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="osrs-bevel-inset w-full bg-osrs-panel-dark/70 px-3 py-2 text-sm text-osrs-parchment placeholder:text-osrs-parchment-dark/50 focus:outline-none"
        />
      </div>

      {turnstileConfigured && <TurnstileWidget ref={turnstileRef} onToken={setCaptchaToken} />}

      {error && <p className="mt-2 text-xs font-semibold text-osrs-red">{error}</p>}
      {notice && <p className="mt-2 text-xs font-semibold text-osrs-green">{notice}</p>}

      <button
        onClick={submit}
        disabled={busy || !email || !password || (turnstileConfigured && !captchaToken)}
        className="osrs-bevel mt-3 w-full bg-gradient-to-b from-osrs-gold/30 to-osrs-gold/10 py-2 font-display text-sm font-bold uppercase tracking-wide text-osrs-gold transition hover:from-osrs-gold/40 hover:to-osrs-gold/20 active:osrs-bevel-inset disabled:opacity-50"
      >
        {busy ? "..." : mode === "in" ? "Sign in" : "Create account"}
      </button>

      <p className="mt-4 text-center text-[10px] text-osrs-parchment-dark/50">
        Playing without an account still works. Progress just stays on this device.
      </p>
    </div>
  );
}

export default function AuthModal({ auth, onClose }: AuthModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      {auth.needsUsername ? <UsernameStep auth={auth} onClose={onClose} /> : <SignInStep auth={auth} onClose={onClose} />}
    </div>
  );
}
