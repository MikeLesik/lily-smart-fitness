import type { Env } from '../../../server/env';
import { json } from '../../../server/http';
import { requireAdmin } from '../../../server/admin';

interface UserRow {
  id: string;
  email: string;
  locale: string;
  marketing_consent: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: number;
}

/** GET ?q=<часть email>&limit= → { users: [{ ..., entitlements, orders }] }, новые сверху. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);

  const { results: users } = await env.DB.prepare(
    `SELECT id, email, locale, marketing_consent, utm_source, utm_medium, utm_campaign, created_at FROM users
     WHERE (?1 = '' OR email LIKE '%' || ?1 || '%') ORDER BY created_at DESC LIMIT ?2`,
  )
    .bind(q, limit)
    .all<UserRow>();
  if (!users.length) return json({ users: [] });

  const ids = users.map((u) => u.id);
  const marks = ids.map(() => '?').join(',');
  const [ents, orders] = await Promise.all([
    env.DB.prepare(
      `SELECT id, user_id, scope, source, status, expires_at, created_at FROM entitlements WHERE user_id IN (${marks}) ORDER BY created_at`,
    )
      .bind(...ids)
      .all<{ id: string; user_id: string; scope: string; source: string; status: string; expires_at: number | null; created_at: number }>(),
    env.DB.prepare(
      `SELECT user_id, items, amount, currency, status, receipt_url, created_at FROM orders WHERE user_id IN (${marks}) ORDER BY created_at DESC`,
    )
      .bind(...ids)
      .all<{ user_id: string; items: string; amount: number; currency: string; status: string; receipt_url: string | null; created_at: number }>(),
  ]);

  return json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      locale: u.locale,
      marketingConsent: u.marketing_consent === 1,
      utm: { utm_source: u.utm_source, utm_medium: u.utm_medium, utm_campaign: u.utm_campaign },
      createdAt: u.created_at,
      entitlements: ents.results
        .filter((e) => e.user_id === u.id)
        .map((e) => ({ id: e.id, scope: e.scope, source: e.source, status: e.status, expiresAt: e.expires_at, createdAt: e.created_at })),
      orders: orders.results
        .filter((o) => o.user_id === u.id)
        .map((o) => ({
          scope: (JSON.parse(o.items) as string[])[0],
          amount: o.amount,
          currency: o.currency,
          status: o.status,
          receiptUrl: o.receipt_url,
          createdAt: o.created_at,
        })),
    })),
  });
};
