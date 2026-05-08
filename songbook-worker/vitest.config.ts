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
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
          },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
        },
      },
    },
  },
});
