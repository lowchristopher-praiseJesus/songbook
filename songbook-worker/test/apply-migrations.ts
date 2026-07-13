import { applyD1Migrations, env } from 'cloudflare:test';

// Runs once per test worker, before any test file. Applies migrations/*.sql to the
// isolated D1 instance so every test starts against the real schema.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
  }
}
