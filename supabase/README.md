# Accounts & leaderboard setup

This app can run in two modes:
- **Guest** (default, no setup): progress lives in the browser's localStorage, exactly as before.
- **Cloud** (once configured): sign in, progress syncs to Postgres, and a public leaderboard shows everyone's GP (and separately, prestige count).

Once every monster is unlocked, a player can prestige: gp/kills/unlocks/inventory reset, and a permanent
`prestige_count` goes up by one, validated server-side by `public.prestige()` in
`migrations/20260823230000_add_prestige.sql` against `npc_reference` (a client can't just claim it unlocked
everything). No manual dashboard step needed here, unlike the email settings below — it's all in migrations.

## One-time setup

1. Create a free project at [supabase.com](https://supabase.com/dashboard).
2. In the Supabase dashboard, open **SQL Editor** and run these three files from this folder, in order:
   - `migrations/0001_init.sql`
   - `migrations/0002_actions.sql`
   - `migrations/0003_seed_reference.sql`
3. (Optional) To enable "Continue with Google" / "Continue with Discord": in **Authentication → Providers**, enable each and follow Supabase's linked instructions to register an OAuth app on that platform. Email/password sign-in works with no extra setup.
4. In **Settings → API**, copy the **Project URL** and the **anon public** key (not the `service_role` key — that one must never be exposed client-side).
5. Give those two values to whoever manages the GitHub repo secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — the deploy workflow reads them from there. For local development, put them in a `.env` file (see `.env.example`).

## Auth emails (sender name, branded template, confirm-link domain)

**Done** (applied directly via the Management API on 2026-08-23):
- Site URL is `https://osrsdropsimulation.com/`; Redirect URLs allow-lists that, the old
  `vangricky.github.io/osrs-drop-simulator/**` (kept as a fallback during the DNS/HTTPS transition — safe to
  remove later), and `http://localhost:5173/**` for local dev.
- Custom SMTP is on, via [Resend](https://resend.com) on the `osrsdropsimulation.com` domain: host
  `smtp.resend.com`, sender `verify@osrsdropsimulation.com`, sender name `OSRS Drop Simulator`.
- The Confirm signup template is `email-templates/confirm-signup.html` from this folder (subject: "Verify your
  OSRS Drop Simulator account"), with a VERIFY ACCOUNT button. It uses `{{ .ConfirmationURL }}`, which already
  picks up the redirect fix from `src/hooks/useAuth.ts` (send users back to wherever they actually signed up
  from, rather than defaulting to Site URL).

Not applied: the other templates (Magic Link, Reset Password, etc.) are still Supabase's generic default —
apply the same `email-templates/confirm-signup.html` pattern to those if you want them on-brand too.

## Keeping reference data in sync

`npc_reference` / `item_reference` / `container_reference` are what the server uses to validate GP changes (unlock costs, sell values, per-kill ceilings) so a signed-in player can't just edit their own save to any number. Re-run `npm run export-reference-data` after `npm run generate-monsters` picks up new monsters — it regenerates `migrations/0003_seed_reference.sql`, which you then re-run in the SQL Editor (it's an upsert, safe to run repeatedly).

## What's NOT validated

Item counts and GP are authoritative server-side. The 28-slot inventory grid's exact layout is a trusted, unvalidated "cloud save" purely for display continuity across devices — faking your own local display doesn't affect the leaderboard, since that only reads `gp`.
