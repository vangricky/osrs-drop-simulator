# Accounts & leaderboard setup

This app can run in two modes:
- **Guest** (default, no setup): progress lives in the browser's localStorage, exactly as before.
- **Cloud** (once configured): sign in, progress syncs to Postgres, and a public leaderboard shows everyone's GP.

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

By default, a fresh Supabase project sends auth emails from **"Supabase Auth" <noreply@mail.app.supabase.io>**,
using a generic template, with confirm/reset links pointing at whatever **Site URL** the project happens to
have (a new project defaults this to `http://localhost:3000`, which is why a real user landed on "localhost").
The app's code now explicitly asks Supabase to send users back to wherever they actually signed up from
(`src/hooks/useAuth.ts`), but two things still have to be set in the dashboard for that to take effect, plus a
third step for the sender name — none of these are configurable from the CLI/migrations:

1. **Authentication → URL Configuration → Site URL**: set to `https://vangricky.github.io/osrs-drop-simulator/`
   (this is also the fallback used if a redirect isn't explicitly allow-listed below).
2. **Authentication → URL Configuration → Redirect URLs**: add both
   `https://vangricky.github.io/osrs-drop-simulator/**` (production) and `http://localhost:5173/**`
   (local dev) — Supabase ignores the app's requested redirect for any URL not on this list and falls back
   to Site URL instead, so this step is required, not optional.
3. **Sender name ("Supabase Auth" → "OSRS Drop Simulator")**: this requires **Custom SMTP**, since the
   built-in mailer has a fixed sender identity. Under **Project Settings → Authentication → SMTP Settings**,
   enable "Enable Custom SMTP" and connect a transactional email provider (e.g. [Resend](https://resend.com)
   or [Postmark](https://postmarkapp.com) — both have a workable free tier and a quick DNS-verification
   setup). Set **Sender name** to `OSRS Drop Simulator` and **Sender email** to an address on a domain you've
   verified with that provider (a raw Gmail/Yahoo address won't pass SPF/DKIM checks).
4. **Branded email body**: under **Authentication → Emails → Templates → Confirm signup**, replace the
   message body with `email-templates/confirm-signup.html` from this folder (subject line suggestion:
   "Confirm your OSRS Drop Simulator account"). It already uses `{{ .ConfirmationURL }}` so it works with
   whatever the app passes as the redirect. Apply the same pattern to the other templates (Magic Link,
   Reset Password, etc.) if you want them on-brand too.

## Keeping reference data in sync

`npc_reference` / `item_reference` / `container_reference` are what the server uses to validate GP changes (unlock costs, sell values, per-kill ceilings) so a signed-in player can't just edit their own save to any number. Re-run `npm run export-reference-data` after `npm run generate-monsters` picks up new monsters — it regenerates `migrations/0003_seed_reference.sql`, which you then re-run in the SQL Editor (it's an upsert, safe to run repeatedly).

## What's NOT validated

Item counts and GP are authoritative server-side. The 28-slot inventory grid's exact layout is a trusted, unvalidated "cloud save" purely for display continuity across devices — faking your own local display doesn't affect the leaderboard, since that only reads `gp`.
