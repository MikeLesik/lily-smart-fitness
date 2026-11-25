import type { Env } from '../../../server/env';
import { json, normalizeEmail, readJson } from '../../../server/http';
import { requireAdmin } from '../../../server/admin';
import { accessExpiresAt, catalog, publishedCategories } from '../../../server/catalog';
import { getOrCreateUser, nowSec } from '../../../server/db';

/**
 * POST { email, scope } → { ok, existing?, expiresAt }. У программы с accessDays право со сроком (сейчас + accessDays дней).
 * Пока действует прежнее право, новое не выдаётся (existing: true). Ручная выдача доступа (например, оплата переводом из России).
 * Пользователь создаётся, если его ещё нет. scope: slug категории или набора (all).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdmin(env, request);
  if (admin instanceof Response) return admin;

  const body = await readJson<{ email: string; scope: string }>(request);
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);
  const scopes = new Set([...publishedCategories().map((c) => c.slug), ...catalog.bundles.map((b) => b.slug)]);
  if (typeof body.scope !== 'string' || !scopes.has(body.scope)) return json({ error: 'invalid_scope' }, 400);

  const user = await getOrCreateUser(env, email);
  const existing = await env.DB.prepare(
    "SELECT id FROM entitlements WHERE user_id = ? AND scope = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)",
  )
    .bind(user.id, body.scope, nowSec())
    .first();
  if (existing) return json({ ok: true, existing: true });

  const now = nowSec();
  const expiresAt = accessExpiresAt(body.scope, now);
  await env.DB.prepare(
    "INSERT INTO entitlements (id, user_id, scope, source, status, expires_at, created_at) VALUES (?, ?, ?, 'manual', 'active', ?, ?)",
  )
    .bind(crypto.randomUUID(), user.id, body.scope, expiresAt, now)
    .run();
  console.log('[admin] grant', JSON.stringify({ by: admin.email, scope: body.scope, user: user.id, expiresAt }));
  return json({ ok: true, expiresAt });
};
