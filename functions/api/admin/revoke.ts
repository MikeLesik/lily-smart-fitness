import type { Env } from '../../../server/env';
import { json, readJson } from '../../../server/http';
import { requireAdmin } from '../../../server/admin';

/** POST { entitlementId } → { ok }. Отзыв любого права (ручного, бесплатного или купленного). */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  const body = await readJson<{ entitlementId: string }>(request);
  if (typeof body.entitlementId !== 'string') return json({ error: 'not_found' }, 404);
  const res = await env.DB.prepare("UPDATE entitlements SET status = 'revoked' WHERE id = ?").bind(body.entitlementId).run();
  if (!res.meta.changes) return json({ error: 'not_found' }, 404);
  console.log('[admin] revoke', JSON.stringify({ by: admin.email, entitlement: body.entitlementId }));
  return json({ ok: true });
};
