import type { Env } from '../../../server/env';
import { json } from '../../../server/http';
import { csv, requireAdmin } from '../../../server/admin';

const iso = (sec: number) => new Date(sec * 1000).toISOString();

/**
 * GET ?type=leads|buyers → CSV (UTF-8 с BOM, для Excel и Google Sheets).
 * leads: все, кто пришёл за бесплатным уроком. buyers: все заказы Stripe с UTM из метаданных оплаты.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  const type = new URL(request.url).searchParams.get('type');
  const date = new Date().toISOString().slice(0, 10);

  if (type === 'leads') {
    const { results } = await env.DB.prepare(
      `SELECT u.email, u.created_at, u.locale, u.marketing_consent, u.utm_source, u.utm_medium, u.utm_campaign
       FROM users u WHERE EXISTS (SELECT 1 FROM entitlements e WHERE e.user_id = u.id AND e.source = 'free')
       ORDER BY u.created_at DESC`,
    ).all<{ email: string; created_at: number; locale: string; marketing_consent: number; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }>();
    return csv(
      ['email', 'created_at', 'locale', 'marketing_consent', 'utm_source', 'utm_medium', 'utm_campaign'],
      results.map((r) => [r.email, iso(r.created_at), r.locale, r.marketing_consent ? 'yes' : 'no', r.utm_source, r.utm_medium, r.utm_campaign]),
      `lily-leads-${date}.csv`,
    );
  }

  if (type === 'buyers') {
    const { results } = await env.DB.prepare(
      'SELECT email, created_at, items, amount, currency, status, utm, receipt_url FROM orders ORDER BY created_at DESC',
    ).all<{ email: string; created_at: number; items: string; amount: number; currency: string; status: string; utm: string | null; receipt_url: string | null }>();
    return csv(
      ['email', 'created_at', 'scope', 'amount', 'currency', 'status', 'utm_source', 'utm_medium', 'utm_campaign', 'receipt_url'],
      results.map((r) => {
        const utm = r.utm ? (JSON.parse(r.utm) as Record<string, string>) : {};
        return [
          r.email,
          iso(r.created_at),
          (JSON.parse(r.items) as string[]).join(' '),
          (r.amount / 100).toFixed(2),
          r.currency.toUpperCase(),
          r.status,
          utm.utm_source,
          utm.utm_medium,
          utm.utm_campaign,
          r.receipt_url,
        ];
      }),
      `lily-buyers-${date}.csv`,
    );
  }

  return json({ error: 'invalid_type' }, 400);
};
