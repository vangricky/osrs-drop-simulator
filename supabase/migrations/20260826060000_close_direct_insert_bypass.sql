-- Security fix: a signed-in user could bypass create_profile_and_state
-- entirely by calling supabase.from("profiles").insert(...) and
-- supabase.from("game_state").insert(...) directly from the browser
-- console. Both INSERT policies only ever checked row ownership
-- (auth.uid() = id / user_id), never the values being inserted, so an
-- attacker could plant their own game_state row with an arbitrary gp
-- and unlocked_npc_ids before create_profile_and_state ever ran for
-- their account (its own inserts would then fail on the primary key
-- and roll back, so the attacker would insert both rows themselves,
-- fully forging an account straight onto the leaderboard).
--
-- 20260823234500_fix_starter_unlock_set.sql already flagged this exact
-- gap in a comment and patched the game_state.unlocked_npc_ids column
-- DEFAULT as a partial mitigation, but a default only applies when a
-- column is omitted from the INSERT — it does nothing against an
-- attacker who explicitly sets gp/unlocked_npc_ids themselves, and gp
-- had no mitigation at all.
--
-- The real fix: neither table needs a client-facing INSERT policy.
-- create_profile_and_state() is security definer and inserts into both
-- tables itself, bypassing RLS entirely, and the client never issues a
-- direct insert into either table (verified against src/hooks/useAuth.ts
-- and src/hooks/useGameState.ts, which only ever select from them).
-- Dropping these policies removes the bypass with no functional change
-- to legitimate signup.

drop policy if exists "Users can create their own profile" on public.profiles;
drop policy if exists "Users can create their own game state" on public.game_state;
