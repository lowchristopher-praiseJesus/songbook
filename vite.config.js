import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [react(), basicSsl()],
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
    exclude: ['**/node_modules/**', '**/.worktrees/**', 'songbook-worker/**'],
  },
})
