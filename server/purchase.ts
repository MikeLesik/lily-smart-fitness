import type { Env } from './env';
import { findSellable } from './catalog';
import { sendPurchaseEmail } from './email';
import { capture } from './analytics';
import type { CheckoutSession } from './stripe';
import type { Order } from './orders';
import type { User } from './db';

/**
 * Новая покупка (первый раз по этой сессии): письмо «Доступ открыт» и событие purchase в PostHog.
 * Ошибки здесь не мешают выдаче доступа: только в лог.
 */
export async function onNewPurchase(
  env: Env,
  r: { order: Order; user: User; scope: string; expiresAt: number | null },
  session: CheckoutSession,
  origin: string,
): Promise<void> {
  const locale = session.metadata?.locale === 'en' ? 'en' : 'ru';
  const title = findSellable(r.scope)!.title;
  try {
    await sendPurchaseEmail(env, r.user.email, (locale === 'en' && title.en) || title.ru, origin, locale, r.expiresAt);
  } catch (err) {
    console.error('[purchase] email failed', String(err));
  }
  const m = session.metadata ?? {};
  await capture(env, 'purchase', r.user.id, {
    slug: r.scope,
    amount: (session.amount_total ?? 0) / 100,
    currency: (session.currency ?? 'eur').toUpperCase(),
    locale,
    order_id: r.order.id,
    utm_source: m.utm_source ?? null,
    utm_medium: m.utm_medium ?? null,
    utm_campaign: m.utm_campaign ?? null,
  });
}
