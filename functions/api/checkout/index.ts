import type { Env } from '../../../server/env';
import { clientIp, json, normalizeEmail, readJson } from '../../../server/http';
import { findSellable } from '../../../server/catalog';
import { getActiveEntitlements } from '../../../server/db';
import { getSessionUser } from '../../../server/session';
import { hit } from '../../../server/ratelimit';
import { createCheckoutSession, StripeError } from '../../../server/stripe';

const HOUR = 60 * 60;

function cleanUtm(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 100);
  }
  return out;
}

/**
 * POST { scope, email?, utm?, locale? } → { url } Stripe Checkout.
 * Регистрация до оплаты не нужна: гостю достаточно email. Вошедшая платит со своим email.
 * 400 invalid_scope | invalid_email, 409 already_owned, 429, 502 stripe_error, 503 payments_unavailable.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await hit(env, `checkout:ip:${clientIp(request)}`, 30, HOUR))) return json({ error: 'rate_limited' }, 429);

  const body = await readJson<{ scope: string; email: string; utm: unknown; locale: string }>(request);
  const item = typeof body.scope === 'string' ? findSellable(body.scope) : null;
  if (!item) return json({ error: 'invalid_scope' }, 400);

  const user = await getSessionUser(env, request);
  const email = user?.email ?? normalizeEmail(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);

  if (user) {
    const owned = await getActiveEntitlements(env, user.id);
    if (owned.some((e) => e.scope === 'all' || e.scope === item.scope)) return json({ error: 'already_owned' }, 409);
  }

  if (!env.STRIPE_SECRET_KEY) return json({ error: 'payments_unavailable' }, 503);

  try {
    const session = await createCheckoutSession(env, {
      item,
      email,
      userId: user?.id,
      origin: new URL(request.url).origin,
      locale: body.locale === 'en' ? 'en' : 'ru',
      utm: cleanUtm(body.utm),
    });
    if (!session.url) throw new StripeError(0, undefined, 'no session url');
    return json({ url: session.url });
  } catch (err) {
    console.error('[checkout] stripe error', err instanceof StripeError ? `${err.status} ${err.code} ${err.message}` : String(err));
    return json({ error: 'stripe_error' }, 502);
  }
};
