import type { Env } from './env';
import { accessExpiresAt, findSellable, scopeTitle } from './catalog';
import { getOrCreateUser, nowSec, type User } from './db';
import { BRAND, type CheckoutSession } from './stripe';

export interface Order {
  id: string;
  user_id: string;
  email: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  amount: number;
  currency: string;
  items: string;
  status: 'paid' | 'refunded';
  receipt_url: string | null;
  login_used_at: number | null;
  created_at: number;
}

export type FulfillResult =
  | { result: 'skipped'; reason: string }
  | { result: 'unpaid' }
  | { result: 'created' | 'exists'; order: Order; user: User; scope: string; /** Срок права (секунды Unix), null = бессрочно. */ expiresAt: number | null };

function paymentIntentId(s: CheckoutSession): string | null {
  if (!s.payment_intent) return null;
  return typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent.id;
}

function receiptUrl(s: CheckoutSession): string | null {
  const pi = s.payment_intent;
  if (!pi || typeof pi === 'string') return null;
  const charge = pi.latest_charge;
  return charge && typeof charge !== 'string' ? charge.receipt_url ?? null : null;
}

function utmOf(s: CheckoutSession): string | null {
  const m = s.metadata ?? {};
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) if (m[k]) utm[k] = m[k];
  return Object.keys(utm).length ? JSON.stringify(utm) : null;
}

export function getOrderBySession(env: Env, sessionId: string): Promise<Order | null> {
  return env.DB.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').bind(sessionId).first<Order>();
}

/**
 * Заказ и право по оплаченной Checkout Session. Идемпотентно: повтор с той же сессией ничего не дублирует.
 * Вызывается из вебхука и из /api/checkout/complete (что придёт первым).
 */
export async function fulfillCheckoutSession(env: Env, s: CheckoutSession): Promise<FulfillResult> {
  if (s.metadata?.brand !== BRAND) return { result: 'skipped', reason: 'foreign' };
  const scope = s.metadata?.scope ?? '';
  if (!findSellable(scope)) return { result: 'skipped', reason: 'unknown_scope' };
  if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') return { result: 'unpaid' };
  const email = (s.customer_details?.email ?? s.customer_email ?? '').trim().toLowerCase();
  if (!email) return { result: 'skipped', reason: 'no_email' };

  const user = await getOrCreateUser(env, email);
  // UTM первого касания у пользователя: из метаданных оплаты, если раньше не было.
  const meta = s.metadata ?? {};
  if (meta.utm_source || meta.utm_medium || meta.utm_campaign) {
    await env.DB.prepare(
      `UPDATE users SET utm_source = COALESCE(utm_source, ?2), utm_medium = COALESCE(utm_medium, ?3),
         utm_campaign = COALESCE(utm_campaign, ?4)
       WHERE id = ?1 AND utm_source IS NULL AND utm_medium IS NULL AND utm_campaign IS NULL`,
    )
      .bind(user.id, meta.utm_source ?? null, meta.utm_medium ?? null, meta.utm_campaign ?? null)
      .run();
  }
  const now = nowSec();
  const inserted = await env.DB.prepare(
    `INSERT INTO orders (id, user_id, email, stripe_session_id, stripe_payment_intent, amount, currency, items, status, receipt_url, utm, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?)
     ON CONFLICT(stripe_session_id) DO NOTHING`,
  )
    .bind(
      crypto.randomUUID(),
      user.id,
      email,
      s.id,
      paymentIntentId(s),
      s.amount_total ?? 0,
      (s.currency ?? 'eur').toLowerCase(),
      JSON.stringify([scope]),
      receiptUrl(s),
      utmOf(s),
      now,
    )
    .run();

  const order = (await getOrderBySession(env, s.id))!;
  if (order.status !== 'paid') return { result: 'exists', order, user, scope, expiresAt: null };

  const receipt = receiptUrl(s);
  if (receipt && !order.receipt_url) {
    await env.DB.prepare('UPDATE orders SET receipt_url = ? WHERE id = ?').bind(receipt, order.id).run();
    order.receipt_url = receipt;
  }
  // Срок считается от выдачи права: у программы с accessDays expires_at = сейчас + accessDays дней.
  // Повтор по той же сессии права не дублирует и срок не продлевает (уникальный индекс order_id + scope).
  await env.DB.prepare(
    `INSERT OR IGNORE INTO entitlements (id, user_id, scope, source, order_id, status, expires_at, created_at)
     VALUES (?, ?, ?, 'stripe', ?, 'active', ?, ?)`,
  )
    .bind(crypto.randomUUID(), order.user_id, scope, order.id, accessExpiresAt(scope, now), now)
    .run();
  const ent = await env.DB.prepare('SELECT expires_at FROM entitlements WHERE order_id = ? AND scope = ?')
    .bind(order.id, scope)
    .first<{ expires_at: number | null }>();

  return { result: inserted.meta.changes > 0 ? 'created' : 'exists', order, user, scope, expiresAt: ent?.expires_at ?? null };
}

/** Полный возврат: заказ refunded, его права revoked. Чужой платёж (нет заказа) игнорируется. */
export async function revokeByPaymentIntent(env: Env, paymentIntent: string): Promise<boolean> {
  const order = await env.DB.prepare('SELECT id FROM orders WHERE stripe_payment_intent = ?').bind(paymentIntent).first<{ id: string }>();
  if (!order) return false;
  await env.DB.batch([
    env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").bind(order.id),
    env.DB.prepare("UPDATE entitlements SET status = 'revoked' WHERE order_id = ?").bind(order.id),
  ]);
  return true;
}

/** Ставит отметку о входе по ссылке возврата. true, если это первый раз. */
export async function claimCheckoutLogin(env: Env, orderId: string): Promise<boolean> {
  const res = await env.DB.prepare('UPDATE orders SET login_used_at = ? WHERE id = ? AND login_used_at IS NULL')
    .bind(nowSec(), orderId)
    .run();
  return res.meta.changes > 0;
}

/** Номер чека: первые 8 шестнадцатеричных знаков id заказа двумя четвёрками, «1A2B-3C4D». */
export function receiptNumber(orderId: string): string {
  const hex = orderId.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/**
 * Заказы для кабинета: из них кабинет рисует свой чек (#/receipt/<id>).
 * Ссылка на чек Stripe (receipt_url) в браузер не уходит: там реквизиты общего аккаунта.
 */
export async function getUserOrders(env: Env, userId: string) {
  const { results } = await env.DB.prepare(
    'SELECT id, items, amount, currency, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(userId)
    .all<{ id: string; items: string; amount: number; currency: string; status: string; created_at: number }>();
  return results.map((o) => {
    const scope = (JSON.parse(o.items) as string[])[0];
    return {
      id: o.id,
      number: receiptNumber(o.id),
      scope,
      title: scopeTitle(scope),
      amount: o.amount,
      currency: o.currency,
      status: o.status,
      createdAt: o.created_at,
    };
  });
}
