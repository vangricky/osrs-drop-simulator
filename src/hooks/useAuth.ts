import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseEnabled } from "../lib/supabase";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [loading, setLoading] = useState(supabaseEnabled);

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data } = await supabase.from("profiles").select("username").eq("id", userId).maybeSingle();
    if (data) {
      setUsername(data.username);
      setNeedsUsername(false);
    } else {
      setUsername(null);
      setNeedsUsername(true);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next) loadProfile(next.user.id);
      else {
        setUsername(null);
        setNeedsUsername(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Without an explicit redirect, Supabase sends users wherever the
  // project's dashboard "Site URL" is set to (defaults to localhost on a
  // fresh project) instead of back to whatever origin they actually signed
  // up from. This must still be added to the project's Redirect URLs
  // allow-list in the dashboard, or Supabase silently falls back anyway.
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

  const signUp = useCallback(async (email: string, password: string, captchaToken?: string) => {
    if (!supabase) throw new Error("accounts are not configured");
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo, captchaToken },
    });
    if (error) throw error;
  }, [redirectTo]);

  const signIn = useCallback(async (email: string, password: string, captchaToken?: string) => {
    if (!supabase) throw new Error("accounts are not configured");
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) throw error;
  }, []);

  const signInWithProvider = useCallback(async (provider: "google" | "discord") => {
    if (!supabase) throw new Error("accounts are not configured");
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw error;
  }, [redirectTo]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const claimUsername = useCallback(
    async (chosen: string) => {
      if (!supabase || !session) throw new Error("not signed in");
      const { error } = await supabase.rpc("create_profile_and_state", { p_username: chosen });
      if (error) throw error;
      setUsername(chosen);
      setNeedsUsername(false);
    },
    [session],
  );

  return {
    enabled: supabaseEnabled,
    loading,
    session,
    userId: session?.user.id ?? null,
    username,
    needsUsername,
    signUp,
    signIn,
    signInWithProvider,
    signOut,
    claimUsername,
  };
}
