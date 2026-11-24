import type { Env } from '../../../server/env';
import { json } from '../../../server/http';

/** Публичные настройки страницы входа. */
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return json({ turnstileSiteKey: env.TURNSTILE_SECRET_KEY ? env.TURNSTILE_SITE_KEY ?? null : null });
};
