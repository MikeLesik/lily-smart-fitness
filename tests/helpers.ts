import { env } from 'cloudflare:workers';
import type { Env } from '../server/env';

type Handler = (ctx: any) => Response | Promise<Response>;

let ipCounter = 0;

/** Уникальный IP на каждый вызов helper'а, чтобы лимиты по IP не мешали соседним тестам. */
export function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

let emailCounter = 0;
export function freshEmail(prefix = 'user'): string {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.com`;
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  cookie?: string;
  ip?: string;
  origin?: string;
  env?: Partial<Env>;
  path?: string;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  /** Тело как есть (для вебхука Stripe, где важна точная строка). */
  rawBody?: string;
}

export async function call(handler: Handler, opts: CallOptions = {}): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.cookie) headers.set('cookie', opts.cookie);
  headers.set('cf-connecting-ip', opts.ip ?? freshIp());
  if (opts.origin) headers.set('origin', opts.origin);
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v);
  const method = opts.method ?? (opts.body === undefined && opts.rawBody === undefined ? 'GET' : 'POST');
  const request = new Request(`https://cabinet.lily-smart-fitness.pages.dev${opts.path ?? '/api/test'}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : opts.rawBody ?? JSON.stringify(opts.body ?? {}),
  });
  return handler({
    request,
    env: { ...env, ...opts.env },
    params: opts.params ?? {},
    data: {},
    functionPath: '',
    waitUntil() {},
    passThroughOnException() {},
    next: async () => new Response('next'),
  });
}

/** "lily_session=abc" из Set-Cookie ответа. */
export function sessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0];
}

/** Пользователь с сессией: создаётся через тот же код, что и при настоящем входе. */
export async function loginAs(email = freshEmail()): Promise<{ cookie: string; userId: string; email: string }> {
  const { getOrCreateUser } = await import('../server/db');
  const { createSession } = await import('../server/session');
  const user = await getOrCreateUser(env as unknown as Env, email);
  const setCookie = await createSession(env as unknown as Env, user.id);
  return { cookie: setCookie.split(';')[0], userId: user.id, email };
}

export async function grant(
  userId: string,
  scope: string,
  opts: { status?: 'active' | 'revoked'; expiresAt?: number | null } = {},
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO entitlements (id, user_id, scope, source, status, expires_at, created_at) VALUES (?, ?, ?, 'manual', ?, ?, 0)",
  )
    .bind(crypto.randomUUID(), userId, scope, opts.status ?? 'active', opts.expiresAt ?? null)
    .run();
}

/** Ключ подписи как у Stream: base64(JSON JWK) + id. Публичный ключ для проверки подписи в тесте. */
export async function streamTestKey(): Promise<{ env: Partial<Env>; publicKey: CryptoKey; keyId: string }> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const keyId = 'testkey0123456789';
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return {
    keyId,
    publicKey: pair.publicKey,
    env: {
      STREAM_CUSTOMER_CODE: 'testcode',
      STREAM_SIGNING_KEY_ID: keyId,
      STREAM_SIGNING_JWK: btoa(JSON.stringify({ ...jwk, kid: keyId })),
    },
  };
}

export function decodeJwt(token: string): { header: any; payload: any; signingInput: string; signature: Uint8Array } {
  const [h, p, s] = token.split('.');
  const dec = (part: string) => {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  };
  const sigBin = dec(s);
  return {
    header: JSON.parse(dec(h)),
    payload: JSON.parse(dec(p)),
    signingInput: `${h}.${p}`,
    signature: Uint8Array.from(sigBin, (c) => c.charCodeAt(0)),
  };
}
