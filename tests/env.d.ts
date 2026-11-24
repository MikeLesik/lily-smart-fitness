// Привязки тестовой среды (см. vitest.config.ts) поверх Env из server/env.ts.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AUTH_SECRET: string;
    APP_ENV?: string;
    EMAIL_FROM?: string;
    RESEND_API_KEY?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];
  }
}
