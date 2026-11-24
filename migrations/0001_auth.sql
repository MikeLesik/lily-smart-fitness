-- Этап 2: пользователи, вход по коду, сессии, права доступа, лимиты запросов.
-- Время везде в секундах Unix.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  locale TEXT NOT NULL DEFAULT 'ru',
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at INTEGER NOT NULL
);

-- Один действующий код на email: новый запрос заменяет старый.
CREATE TABLE login_codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- В базе только SHA-256 токена из cookie.
CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_id ON sessions(user_id);

-- scope: slug категории или 'all'. expires_at NULL = навсегда.
CREATE TABLE entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('stripe', 'manual', 'free')),
  order_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX entitlements_user_id ON entitlements(user_id);

-- Фиксированное окно: key = '<действие>:<email|ip>:<значение>'.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
