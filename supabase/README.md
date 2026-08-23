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

## Fixing auth emails ("Supabase Auth" sender, confirm link goes to localhost)

**Already done** (applied directly via the Management API on 2026-08-23): Site URL is set to
`https://vangricky.github.io/osrs-drop-simulator/`, and Redirect URLs allow-lists both that and
`http://localhost:5173/**` for local dev. Combined with the app's code, which explicitly asks Supabase to
redirect back to wherever the user actually signed up from (`src/hooks/useAuth.ts`), confirm-email links no
longer land on localhost.

**Still needs manual setup — Custom SMTP.** Supabase's API rejected changing the sender name *and* the email
template body with the same error: on the free tier, both are locked to the built-in mailer and only unlock
once Custom SMTP is configured. There's no way around this without connecting a transactional email provider:

1. Create an account with a provider like [Resend](https://resend.com) or [Postmark](https://postmarkapp.com)
   (both have a workable free tier) and verify a domain you own via their DNS instructions (SPF/DKIM records)
   — a raw Gmail/Yahoo address won't pass those checks, so this needs a real domain.
2. In **Project Settings → Authentication → SMTP Settings**, enable "Enable Custom SMTP" and fill in the
   host/port/username/password from that provider, with **Sender name** set to `OSRS Drop Simulator` and
   **Sender email** on the verified domain.
3. Once Custom SMTP is on, go to **Authentication → Emails → Templates → Confirm signup** and paste in
   `email-templates/confirm-signup.html` from this folder as the body (subject line suggestion: "Confirm your
   OSRS Drop Simulator account"). It already uses `{{ .ConfirmationURL }}`, so it picks up the redirect fix
   above automatically. Apply the same pattern to the other templates (Magic Link, Reset Password, etc.) if
   you want those on-brand too.

## Keeping reference data in sync

`npc_reference` / `item_reference` / `container_reference` are what the server uses to validate GP changes (unlock costs, sell values, per-kill ceilings) so a signed-in player can't just edit their own save to any number. Re-run `npm run export-reference-data` after `npm run generate-monsters` picks up new monsters — it regenerates `migrations/0003_seed_reference.sql`, which you then re-run in the SQL Editor (it's an upsert, safe to run repeatedly).

## What's NOT validated

Item counts and GP are authoritative server-side. The 28-slot inventory grid's exact layout is a trusted, unvalidated "cloud save" purely for display continuity across devices — faking your own local display doesn't affect the leaderboard, since that only reads `gp`.
