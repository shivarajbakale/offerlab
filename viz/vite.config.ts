import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Solutions live one level up in ../neetcode-150.
  server: { fs: { allow: ['..'] }, open: true },
  worker: { format: 'es' },
})
