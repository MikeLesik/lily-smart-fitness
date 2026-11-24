import type { Env } from './env';

/** true, если проверка пройдена или Turnstile не настроен (нет секрета). */
export async function verifyTurnstile(env: Env, token: unknown, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip !== 'unknown') form.append('remoteip', ip);
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
    const data = await res.json<{ success?: boolean }>();
    return data.success === true;
  } catch {
    return false;
  }
}
