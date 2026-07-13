export interface Env {
  R2_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  DB: D1Database;
  APP_ORIGIN: string;
  WALKIE_ORIGIN: string;
  LICENSE_SECRET: string;
  LICENSE_TOKEN_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
}
