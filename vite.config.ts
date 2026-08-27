import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Custom domain serves from the root, not a /osrs-drop-simulator/ subpath
  // (that was only needed for the old vangricky.github.io/osrs-drop-simulator/ URL).
  base: '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Multi-page build: the Pet Drop Sim is a second real React app (own
      // HTML entry + own mount script, see src/pets-main.tsx), not a
      // client-side route — this repo has no router, and a real static
      // /pet-drop-sim/index.html is what lets GitHub Pages serve it
      // directly with no SPA-fallback trick needed. Same reasoning as
      // public/faq/, just React-rendered instead of hand-written since this
      // page needs the actual game data (boss drop tables, pet rates).
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        petDropSim: resolve(import.meta.dirname, 'pet-drop-sim/index.html'),
      },
      output: {
        // Splits large, rarely-changing vendor code into its own chunk(s) so
        // a deploy that only touches app code (which is most of them) doesn't
        // force every returning visitor to re-download React/Supabase/dnd-kit
        // too — those chunks stay cached across deploys under their own
        // content hash.
        manualChunks: (id: string) => {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react")) return "react";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("@dnd-kit")) return "dnd-kit";
          return undefined;
        },
      },
    },
  },
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
