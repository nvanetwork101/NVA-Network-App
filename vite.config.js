import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa' // Import the PWA plugin

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Add the PWA plugin configuration
    VitePWA({
      registerType: 'autoUpdate', // Automatically update the app in the background
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'] // Cache these file types
      },
      manifest: {
        name: 'NVA Network',
        short_name: 'NVA Network', // As requested, full name for the home screen icon
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