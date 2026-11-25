import type { Env } from '../../server/env';
import { json } from '../../server/http';
import { getActiveEntitlements, getExpiredEntitlements } from '../../server/db';
import { getSessionUser } from '../../server/session';
import { getUserOrders } from '../../server/orders';

/**
 * GET → { user, entitlements, expired, orders }. entitlements: действующие права с expiresAt (null = бессрочно).
 * expired: программы, срок которых закончился (и нового права нет). Гость получает пустые списки с кодом 200.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return json({ user: null, entitlements: [], expired: [], orders: [] });
  const [entitlements, expired] = await Promise.all([getActiveEntitlements(env, user.id), getExpiredEntitlements(env, user.id)]);
  return json({
    user: { id: user.id, email: user.email, locale: user.locale },
    entitlements: entitlements.map((e) => ({ scope: e.scope, source: e.source, expiresAt: e.expires_at })),
    expired: expired.map((e) => ({ scope: e.scope, expiresAt: e.expires_at })),
    orders: await getUserOrders(env, user.id),
  });
};
