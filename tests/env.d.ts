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
    STREAM_CUSTOMER_CODE?: string;
    STREAM_SIGNING_KEY_ID?: string;
    STREAM_SIGNING_JWK?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    ADMIN_EMAILS?: string;
    POSTHOG_KEY?: string;
    POSTHOG_HOST?: string;
    TEST_MIGRATIONS: import('@cloudflare/vitest-plugin').D1Migration[];
  }
}
