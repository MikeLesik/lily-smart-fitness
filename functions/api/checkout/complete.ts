import type { Env } from '../../../server/env';
import { findSellable } from '../../../server/catalog';
import { nowSec } from '../../../server/db';
import { createSession } from '../../../server/session';
import { retrieveCheckoutSession } from '../../../server/stripe';
import { claimCheckoutLogin, fulfillCheckoutSession } from '../../../server/orders';
import { sendPurchaseEmail } from '../../../server/email';

/** Ссылка возврата даёт вход без кода только один раз и только в первый час после оплаты. */
const LOGIN_WINDOW_SEC = 60 * 60;

function redirect(location: string, setCookie?: string): Response {
  const headers = new Headers({ location, 'referrer-policy': 'no-referrer' });
  if (setCookie) headers.set('set-cookie', setCookie);
  return new Response(null, { status: 302, headers });
}

/**
 * GET ?session_id= — возврат из Stripe Checkout. Проверяет оплату в Stripe (не верит параметрам браузера),
 * выдаёт право (если вебхук ещё не успел), ставит cookie и ведёт в кабинет на купленную программу.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const id = url.searchParams.get('session_id') ?? '';
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return redirect('/checkout/cancel/');

  let session;
  try {
    session = await retrieveCheckoutSession(env, id);
  } catch {
    return redirect('/checkout/cancel/');
  }

  const r = await fulfillCheckoutSession(env, session);
  if (r.result === 'unpaid') return redirect('/checkout/success/?pending=1');
  if (r.result === 'skipped') return redirect('/checkout/cancel/');

  if (r.result === 'created') {
    try {
      await sendPurchaseEmail(env, r.user.email, findSellable(r.scope)!.title.ru, url.origin);
    } catch (err) {
      console.error('[checkout] purchase email failed', String(err));
    }
  }

  const target = r.scope === 'all' ? '/account/?paid=all#/' : `/account/?paid=${r.scope}#/c/${r.scope}`;
  const fresh = nowSec() - r.order.created_at < LOGIN_WINDOW_SEC;
  if (fresh && r.order.status === 'paid' && (await claimCheckoutLogin(env, r.order.id))) {
    return redirect(target, await createSession(env, r.order.user_id));
  }
  return redirect(`/login/?next=${encodeURIComponent(target)}`);
};
