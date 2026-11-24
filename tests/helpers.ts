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
}

export async function call(handler: Handler, opts: CallOptions = {}): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.cookie) headers.set('cookie', opts.cookie);
  headers.set('cf-connecting-ip', opts.ip ?? freshIp());
  if (opts.origin) headers.set('origin', opts.origin);
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
  const request = new Request(`https://cabinet.lily-smart-fitness.pages.dev${opts.path ?? '/api/test'}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
  });
  return handler({
    request,
    env: { ...env, ...opts.env },
    params: {},
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
