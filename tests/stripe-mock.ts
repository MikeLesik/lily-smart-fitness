import { vi } from 'vitest';

export interface StripeCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: URLSearchParams;
  auth: string | null;
}

type Route = (call: StripeCall) => { status?: number; body: unknown } | undefined;

/**
 * Подменяет fetch для api.stripe.com. routes по очереди получают вызов; первый вернувший ответ побеждает.
 * Неизвестный запрос к Stripe получает 404. Остальной fetch не трогаем.
 */
export function mockStripe(routes: Route[]) {
  const calls: StripeCall[] = [];
  const original = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    if (url.hostname !== 'api.stripe.com') return original(input as RequestInfo, init);
    const call: StripeCall = {
      method: req.method,
      path: url.pathname,
      query: url.searchParams,
      body: new URLSearchParams(req.method === 'GET' ? '' : await req.text()),
      auth: req.headers.get('authorization'),
    };
    calls.push(call);
    for (const route of routes) {
      const res = route(call);
      if (res) return new Response(JSON.stringify(res.body), { status: res.status ?? 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'resource_missing', message: 'No such resource' } }), { status: 404 });
  });
  return { calls, restore: () => spy.mockRestore() };
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Заголовок Stripe-Signature, как его ставит Stripe. */
export async function stripeSignature(payload: string, secret = 'whsec_test_secret', t = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}

let n = 0;
const rid = (p: string) => `${p}_${Date.now().toString(36)}${(++n).toString(36)}`;

export function checkoutSession(over: Record<string, unknown> = {}) {
  const email = (over.email as string) ?? `buyer-${rid('b')}@example.com`;
  const scope = (over.scope as string) ?? 'yagodicy';
  const { email: _e, scope: _s, metadata, ...rest } = over;
  return {
    id: rid('cs_test'),
    object: 'checkout.session',
    mode: 'payment',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 3900,
    currency: 'eur',
    customer_email: email,
    customer_details: { email },
    payment_intent: rid('pi'),
    created: Math.floor(Date.now() / 1000),
    metadata: metadata ?? { brand: 'lily', scope },
    ...rest,
  };
}

export function stripeEvent(type: string, object: unknown) {
  return { id: rid('evt'), object: 'event', type, created: Math.floor(Date.now() / 1000), data: { object } };
}
