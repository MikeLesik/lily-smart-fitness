import type { Env } from '../../server/env';
import { json, readJson } from '../../server/http';
import { localeOf, startLogin } from '../../server/login-flow';
import { isComingSoon, publishedCategories } from '../../server/catalog';
import { getOrCreateUser, nowSec } from '../../server/db';

function cleanUtm(raw: unknown): Record<'utm_source' | 'utm_medium' | 'utm_campaign', string | null> {
  const get = (k: string) => {
    const v = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[k] : null;
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null;
  };
  return { utm_source: get('utm_source'), utm_medium: get('utm_medium'), utm_campaign: get('utm_campaign') };
}

/**
 * POST { email, consent, turnstileToken, utm, locale } → 200 { ok: true } и письмо с кодом.
 * Лид из /free/: пользователь (согласие на письма, UTM первого касания, язык) и право на бесплатную категорию.
 * Согласие не снимается повторной заявкой, UTM не перезаписывается. Дальше вход по коду: /api/auth/verify-code.
 * Урока ещё нет (в бесплатной категории нет видео): 409 coming_soon, без письма и без записи в базу.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const free = publishedCategories().find((c) => c.free);
  if (!free || isComingSoon(free)) return json({ error: 'coming_soon' }, 409);

  const body = await readJson<{ email: string; consent: boolean; turnstileToken: string; utm: unknown; locale: string }>(request);
  const locale = localeOf(body.locale);
  const utm = cleanUtm(body.utm);
  const consent = body.consent === true ? 1 : 0;

  return startLogin(env, request, { email: body.email, turnstileToken: body.turnstileToken, locale, ipKey: 'lead' }, async (email) => {
    const user = await getOrCreateUser(env, email, locale);
    await env.DB.prepare(
      `UPDATE users SET
         marketing_consent = MAX(marketing_consent, ?2),
         utm_source = COALESCE(utm_source, ?3),
         utm_medium = COALESCE(utm_medium, ?4),
         utm_campaign = COALESCE(utm_campaign, ?5)
       WHERE id = ?1`,
    )
      .bind(user.id, consent, utm.utm_source, utm.utm_medium, utm.utm_campaign)
      .run();
    await env.DB.prepare(
      `INSERT INTO entitlements (id, user_id, scope, source, status, created_at)
       SELECT ?1, ?2, ?3, 'free', 'active', ?4
       WHERE NOT EXISTS (SELECT 1 FROM entitlements WHERE user_id = ?2 AND scope = ?3 AND source = 'free')`,
    )
      .bind(crypto.randomUUID(), user.id, free.slug, nowSec())
      .run();
  });
};
