export interface Env {
  DB: D1Database;
  /** Перец для хешей кодов входа. Секрет. */
  AUTH_SECRET: string;
  /** local | test | preview | production */
  APP_ENV?: string;
  /** "Lily <hello@lily.coach>" */
  EMAIL_FROM?: string;
  /** Без ключа письма не шлются, код пишется в консоль. Секрет. */
  RESEND_API_KEY?: string;
  /** Публичный ключ виджета, отдаётся странице входа. */
  TURNSTILE_SITE_KEY?: string;
  /** Без секрета проверка Turnstile пропускается (локально и в тестах). Секрет. */
  TURNSTILE_SECRET_KEY?: string;
  /** Код из адреса customer-<код>.cloudflarestream.com. Не секрет. */
  STREAM_CUSTOMER_CODE?: string;
  /** id ключа подписи Stream. */
  STREAM_SIGNING_KEY_ID?: string;
  /** Ключ подписи Stream: base64 от JSON JWK, как его отдаёт API Stream. Секрет. */
  STREAM_SIGNING_JWK?: string;
}
