import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // A service worker saves every built file on the first visit, so the installed app works offline.
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // public/site.webmanifest is the manifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // The app bundle and the tracer workers are 3-4 MB each before compression.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 30 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
  // GitHub Pages serves the site under /offerlab/; the Pages workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  // Solutions live one level up in ../neetcode-150.
  server: { fs: { allow: ['..'] }, open: true },
  worker: { format: 'es' },
})
