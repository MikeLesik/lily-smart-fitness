import type { Env } from './env';

/**
 * События с сервера в PostHog (capture API). Без POSTHOG_KEY ничего не делает.
 * Email и другие персональные данные не отправляем: distinct_id = id пользователя в нашей базе.
 */
export async function capture(env: Env, event: string, distinctId: string, properties: Record<string, unknown>): Promise<void> {
  if (!env.POSTHOG_KEY) return;
  const host = (env.POSTHOG_HOST ?? 'https://eu.i.posthog.com').replace(/\/$/, '');
  try {
    const res = await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: env.POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: { ...properties, environment: env.APP_ENV ?? 'unknown', $lib: 'lily-server' },
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) console.warn('[analytics] posthog', res.status);
  } catch (err) {
    console.warn('[analytics] posthog failed', String(err));
  }
}
