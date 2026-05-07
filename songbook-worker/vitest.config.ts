import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            APP_ORIGIN: 'http://localhost:5173',
            LICENSE_SECRET: 'test-license-secret',
            LICENSE_TOKEN_SECRET: 'test-token-secret',
          },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
        },
      },
    },
  },
});
