import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

const migrations = await readD1Migrations('./migrations');

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/apply-migrations.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            APP_ORIGIN: 'http://localhost:5173',
            LICENSE_SECRET: 'test-license-secret',
            LICENSE_TOKEN_SECRET: 'test-token-secret',
            TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
            TEST_MIGRATIONS: migrations,
          },
          kvNamespaces: ['SESSION_KV'],
          r2Buckets: ['R2_BUCKET'],
          d1Databases: ['DB'],
        },
      },
    },
  },
});
