import type { Env } from '../../server/env';
import { json } from '../../server/http';
import { getActiveEntitlements } from '../../server/db';
import { getSessionUser } from '../../server/session';
import { getUserOrders } from '../../server/orders';

/** GET → { user, entitlements, orders }. Гость получает { user: null, entitlements: [], orders: [] } с кодом 200. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return json({ user: null, entitlements: [], orders: [] });
  const entitlements = await getActiveEntitlements(env, user.id);
  return json({
    user: { id: user.id, email: user.email, locale: user.locale },
    entitlements: entitlements.map((e) => ({ scope: e.scope, source: e.source, expiresAt: e.expires_at })),
    orders: await getUserOrders(env, user.id),
  });
};
