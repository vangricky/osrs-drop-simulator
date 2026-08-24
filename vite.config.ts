import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Custom domain serves from the root, not a /osrs-drop-simulator/ subpath
  // (that was only needed for the old vangricky.github.io/osrs-drop-simulator/ URL).
  base: '/',
  plugins: [react(), tailwindcss()],
  define: {
    // public/data/*.json is fetched at a fixed URL (see loadGameData.ts) so
    // it can be updated without a full app redeploy (e.g. the daily price
    // refresh job) — but that same fixed URL means a browser or GitHub
    // Pages' CDN can keep serving an old cached copy indefinitely after a
    // real data change. Stamped with the build time so every deploy forces
    // a fresh fetch via a cache-busting query param.
    __DATA_BUILD_TIME__: JSON.stringify(Date.now()),
  },
})
