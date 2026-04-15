import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { APP_ORIGIN: 'http://localhost:5173' },
          kvNamespaces: ['SESSION_KV'],
        },
      },
    },
  },
});
