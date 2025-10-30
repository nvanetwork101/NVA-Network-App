import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    sourcemap: true,
  },
  plugins: [
    react(),
     VitePWA({
      registerType: 'prompt',
      // THE DEFINITIVE FIX: We disable service worker generation entirely.
      // The plugin will now ONLY generate the manifest.json file.
      strategies: 'injectManifest',
      injectManifest: {
        globPatterns: [] // No files will be precached by the PWA plugin.
      },
      // We explicitly tell the plugin NOT to generate a service worker.
      selfDestroying: true,
      manifest: {
        name: 'NVA Network',
        short_name: 'NVA Network',
        description: 'Caribbean Content to a Global Stage.',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})