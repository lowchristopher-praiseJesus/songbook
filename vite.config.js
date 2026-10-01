import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      // 'prompt': a new version waits until the user taps "Reload" (see UpdatePrompt),
      // so a deploy never swaps code under someone mid-song.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'SongSheet',
        short_name: 'SongSheet',
        description: 'Import, view and perform chord charts',
        theme_color: '#4338ca',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only. Background PNGs (~70 MB) and font subsets are runtime-cached instead.
        globPatterns: ['**/*.{js,css,html,svg}'],
        // Static docs pages and the album deep-link must not be rewritten to index.html.
        navigateFallbackDenylist: [/^\/Documentation-songbook\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) =>
              url.origin === self.location.origin &&
              (request.destination === 'image' || request.destination === 'font' ||
                url.pathname.startsWith('/fonts/')),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: {
      '/worker': {
        target: 'http://localhost:8787',
        rewrite: path => path.replace(/^\/worker/, ''),
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    exclude: ['**/node_modules/**', '**/.worktrees/**', 'songbook-worker/**', 'admin/**'],
  },
})
