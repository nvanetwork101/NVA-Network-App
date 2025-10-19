import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    sourcemap: true, // Enable source maps for debugging
  },
  plugins: [
    react(),
    // Add the PWA plugin configuration
    VitePWA({
      registerType: 'autoUpdate',
      // THIS IS THE FINAL FIX: Disable the conflicting auto-registration
      injectRegister: null,
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'firebase-messaging-sw.js',
      injectManifest: {
        // This tells the plugin to find and cache all our app's files
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
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