-- Этап 4: заказы Stripe, журнал событий вебхука, одно право на заказ и область.

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  email TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  -- JSON-массив областей: ["yagodicy"] или ["all"]
  items TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'refunded')),
  receipt_url TEXT,
  -- JSON с utm_source, utm_medium, utm_campaign
  utm TEXT,
  -- Когда по возврату из Stripe поставили cookie (один раз)
  login_used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX orders_user_id ON orders(user_id);
CREATE INDEX orders_payment_intent ON orders(stripe_payment_intent);

CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX entitlements_order_scope ON entitlements(order_id, scope) WHERE order_id IS NOT NULL;
