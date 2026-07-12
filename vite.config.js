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
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'firebase-messaging-sw.js',
      devOptions: {
        enabled: true
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      manifest: {
        name: 'NVA Network', short_name: 'NVA Network',
        description: 'Caribbean Caribbean Content to a Global Stage.',
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
  // THE VITEST CONFIGURATION BINDING:
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'functions/**', // THE FIX: Prevent Vitest from trying to compile and run your backend Jest suites!
    ],
  },
})