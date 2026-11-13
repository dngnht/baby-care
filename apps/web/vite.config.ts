import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // `knowledge/**` lives outside the app root and is imported with `?raw`
  // (dashboard reference table), so the dev server must be allowed to read it.
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'BéYêu',
        short_name: 'BéYêu',
        description:
          'Theo dõi bú, ngủ, tã, tăng trưởng và lịch tiêm cho bé 0–24 tháng. Hoạt động ngoại tuyến.',
        lang: 'vi',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#07110f',
        background_color: '#07110f',
        categories: ['health', 'lifestyle', 'parenting'],
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Bú',
            short_name: 'Bú',
            description: 'Ghi nhanh một cữ bú',
            url: '/',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Tã',
            short_name: 'Tã',
            description: 'Ghi nhanh một lần thay tã',
            url: '/',
            icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'eslint-rules/**/*.test.{js,ts}'],
    restoreMocks: true,
  },
})
