import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site under /offerlab/; the Pages workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  // Solutions live one level up in ../neetcode-150.
  server: { fs: { allow: ['..'] }, open: true },
  worker: { format: 'es' },
})
