// Public by design — Turnstile site keys are meant to be embedded in
// client-side HTML, unlike the secret key (which only ever lives in
// Supabase's Auth settings, never in this codebase).
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

/** No Turnstile site key configured (local dev, or not set up yet) — the
 * widget renders nothing and AuthModal treats captcha as not required. */
export const turnstileConfigured = Boolean(TURNSTILE_SITE_KEY);
