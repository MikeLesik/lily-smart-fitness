import type { Env } from './env';
import type { Sellable } from './catalog';
import { hmacHex, safeEqual } from './crypto';

/**
 * Stripe без SDK: fetch к REST API, тело application/x-www-form-urlencoded.
 * Аккаунт общий с Restore Lab, поэтому всё наше помечено metadata.brand = "lily".
 */

const API = 'https://api.stripe.com';
export const BRAND = 'lily';

export class StripeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

type Params = Record<string, unknown>;

/** {a: {b: [1]}} → a[b][0]=1 */
export function encodeForm(params: Params, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === 'object') encodeForm(v as Params, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(v));
      });
    } else if (typeof value === 'object') {
      encodeForm(value as Params, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

export async function stripeRequest<T = any>(
  env: Env,
  method: 'GET' | 'POST',
  path: string,
  params: Params = {},
): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new StripeError(0, 'not_configured', 'STRIPE_SECRET_KEY is not set');
  const form = encodeForm(params);
  const url = method === 'GET' && [...form].length ? `${API}${path}?${form}` : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' ? form.toString() : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new StripeError(res.status, data?.error?.code, data?.error?.message ?? `Stripe ${res.status}`);
  }
  return data as T;
}

/* ---------- Цены из каталога ---------- */

const priceCache = new Map<string, string>();

export type Locale = 'ru' | 'en';

/** Товар на языке покупательницы: lily_<scope> (RU), lily_<scope>_en (EN), чтобы Stripe показал название на её языке. */
function productKey(item: Sellable, locale: Locale): string {
  return locale === 'en' ? `${BRAND}_${item.scope}_en` : `${BRAND}_${item.scope}`;
}

/** <товар>_<amount>_<currency>: новая цена в каталоге = новый ключ = новая Price в Stripe. */
export function lookupKey(item: Sellable, locale: Locale = 'ru'): string {
  return `${productKey(item, locale)}_${item.price.amount}_${item.price.currency.toLowerCase()}`;
}

async function findPrice(env: Env, key: string): Promise<string | null> {
  const list = await stripeRequest<{ data: Array<{ id: string }> }>(env, 'GET', '/v1/prices', {
    lookup_keys: [key],
    active: true,
    limit: 1,
  });
  return list.data[0]?.id ?? null;
}

/**
 * Находит или создаёт в Stripe товар lily_<scope> и цену с lookup_key из каталога.
 * Так источником цены остаётся content/catalog.json, а в Stripe ничего не заводится руками.
 */
export async function ensurePrice(env: Env, item: Sellable, locale: Locale = 'ru'): Promise<string> {
  const key = lookupKey(item, locale);
  const cacheKey = `${env.STRIPE_SECRET_KEY}|${key}`;
  const cached = priceCache.get(cacheKey);
  if (cached) return cached;

  let priceId = await findPrice(env, key);
  if (!priceId) {
    const productId = productKey(item, locale);
    try {
      await stripeRequest(env, 'GET', `/v1/products/${productId}`);
    } catch (err) {
      if (!(err instanceof StripeError) || err.status !== 404) throw err;
      await stripeRequest(env, 'POST', '/v1/products', {
        id: productId,
        name: (locale === 'en' && item.title.en) || item.title.ru,
        metadata: { brand: BRAND, scope: item.scope },
      });
    }
    try {
      const price = await stripeRequest<{ id: string }>(env, 'POST', '/v1/prices', {
        product: productId,
        currency: item.price.currency.toLowerCase(),
        unit_amount: item.price.amount,
        lookup_key: key,
        metadata: { brand: BRAND, scope: item.scope },
      });
      priceId = price.id;
    } catch (err) {
      // Параллельный запрос мог создать цену с тем же lookup_key.
      priceId = await findPrice(env, key);
      if (!priceId) throw err;
    }
  }
  priceCache.set(cacheKey, priceId);
  return priceId;
}

/* ---------- Checkout ---------- */

export interface CheckoutSession {
  id: string;
  url?: string;
  status?: string;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total: number | null;
  currency: string | null;
  customer_email?: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | { id: string; latest_charge?: string | { id: string; receipt_url?: string | null } | null } | null;
  metadata?: Record<string, string> | null;
  created?: number;
}

export interface CheckoutInput {
  item: Sellable;
  email: string;
  userId?: string;
  origin: string;
  locale: 'ru' | 'en';
  utm: Record<string, string>;
}

export async function createCheckoutSession(env: Env, input: CheckoutInput): Promise<CheckoutSession> {
  const price = await ensurePrice(env, input.item, input.locale);
  const metadata = { brand: BRAND, scope: input.item.scope, locale: input.locale, ...input.utm };
  const prefix = input.locale === 'en' ? '/en' : '';
  return stripeRequest<CheckoutSession>(env, 'POST', '/v1/checkout/sessions', {
    mode: 'payment',
    line_items: [{ price, quantity: 1 }],
    customer_email: input.email,
    client_reference_id: input.userId,
    metadata,
    payment_intent_data: {
      metadata: { brand: BRAND, scope: input.item.scope },
      statement_descriptor_suffix: 'LILY COACH',
    },
    allow_promotion_codes: true,
    // Только евро: без пересчёта в валюту покупательницы. Перекрывает настройку Adaptive Pricing общего аккаунта.
    adaptive_pricing: { enabled: false },
    locale: input.locale,
    success_url: `${input.origin}/api/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}${prefix}/checkout/cancel/?scope=${encodeURIComponent(input.item.scope)}`,
    // Оформление страницы оплаты под lily.coach (аккаунт общий с Restore Lab).
    branding_settings: {
      display_name: 'Lily',
      background_color: '#F5F0EB',
      button_color: '#C4A265',
      border_style: 'rectangular',
      icon: { type: 'url', url: 'https://lily.coach/assets/images/apple-touch-icon.png' },
      logo: { type: 'url', url: 'https://lily.coach/assets/images/apple-touch-icon.png' },
    },
  });
}

export function retrieveCheckoutSession(env: Env, id: string): Promise<CheckoutSession> {
  return stripeRequest<CheckoutSession>(env, 'GET', `/v1/checkout/sessions/${encodeURIComponent(id)}`, {
    expand: ['payment_intent.latest_charge'],
  });
}

/* ---------- Вебхук ---------- */

const TOLERANCE_SEC = 300;

/** Проверка заголовка Stripe-Signature: t=..., v1=... (HMAC-SHA256 от "t.payload"). */
export async function verifyStripeSignature(payload: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  let t = 0;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2);
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) v1.push(v);
  }
  if (!t || !v1.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > TOLERANCE_SEC) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return v1.some((sig) => safeEqual(sig, expected));
}
