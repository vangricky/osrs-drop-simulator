/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build timestamp injected by vite.config.ts's `define`, used to cache-bust
 * the public/data/*.json fetches (see loadGameData.ts). */
declare const __DATA_BUILD_TIME__: string;
