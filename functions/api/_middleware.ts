import type { Env } from '../../server/env';
import { json } from '../../server/http';

/**
 * Для всех /api/*:
 * - POST/PUT/PATCH/DELETE только со своего сайта (Origin совпадает с адресом запроса);
 * - ответы не кешируются;
 * - необработанная ошибка превращается в JSON 500.
 */
export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request } = ctx;
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return json({ error: 'bad_origin' }, 403, { 'cache-control': 'no-store' });
    }
  }

  let res: Response;
  try {
    res = await ctx.next();
  } catch (err) {
    console.error('[api] unhandled', err);
    res = json({ error: 'server_error' }, 500);
  }
  res = new Response(res.body, res);
  res.headers.set('cache-control', 'no-store');
  return res;
};
