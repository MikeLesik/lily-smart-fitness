import type { Env } from '../../../server/env';
import { json } from '../../../server/http';
import { nowSec } from '../../../server/db';
import { BRAND, retrieveCheckoutSession, verifyStripeSignature, type CheckoutSession } from '../../../server/stripe';
import { fulfillCheckoutSession, revokeByPaymentIntent } from '../../../server/orders';
import { onNewPurchase } from '../../../server/purchase';

/**
 * Вебхук Stripe. Аккаунт общий с Restore Lab: всё без metadata.brand = "lily" отвечаем 200 и пропускаем.
 * Идемпотентно: event_id пишется в stripe_events, заказ уникален по stripe_session_id.
 * События: checkout.session.completed, checkout.session.async_payment_succeeded, charge.refunded.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.STRIPE_WEBHOOK_SECRET) return json({ error: 'not_configured' }, 500);
  const raw = await request.text();
  if (!(await verifyStripeSignature(raw, request.headers.get('stripe-signature'), env.STRIPE_WEBHOOK_SECRET))) {
    return json({ error: 'bad_signature' }, 400);
  }

  let event: { id: string; type: string; data: { object: any } };
  try {
    event = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_payload' }, 400);
  }

  const seen = await env.DB.prepare('SELECT 1 FROM stripe_events WHERE event_id = ?').bind(event.id).first();
  if (seen) return json({ received: true, duplicate: true });

  let ours = false;
  const origin = new URL(request.url).origin;

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as CheckoutSession;
    ours = session.metadata?.brand === BRAND;
    if (ours) {
      const r = await fulfillCheckoutSession(env, session);
      if (r.result === 'created') {
        // Чек и письмо: не критично для выдачи доступа, ошибки только в лог.
        try {
          await fulfillCheckoutSession(env, await retrieveCheckoutSession(env, session.id));
        } catch (err) {
          console.warn('[stripe] receipt lookup failed', String(err));
        }
        await onNewPurchase(env, r, session, origin);
      }
    }
  } else if (event.type === 'charge.refunded') {
    const charge = event.data.object as { payment_intent?: string | null; refunded?: boolean };
    // Частичный возврат доступ не закрывает, только полный (refunded: true).
    if (charge.payment_intent && charge.refunded) ours = await revokeByPaymentIntent(env, charge.payment_intent);
  }

  if (ours) {
    await env.DB.prepare('INSERT OR IGNORE INTO stripe_events (event_id, type, received_at) VALUES (?, ?, ?)')
      .bind(event.id, event.type, nowSec())
      .run();
  }
  return json({ received: true });
};
