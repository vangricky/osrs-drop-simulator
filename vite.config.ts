import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Custom domain serves from the root, not a /osrs-drop-simulator/ subpath
  // (that was only needed for the old vangricky.github.io/osrs-drop-simulator/ URL).
  base: '/',
  plugins: [react(), tailwindcss()],
})
