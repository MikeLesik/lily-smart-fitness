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
}
