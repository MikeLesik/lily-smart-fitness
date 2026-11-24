import type { Env } from './env';
import { clientIp, json, normalizeEmail } from './http';
import { hit } from './ratelimit';
import { verifyTurnstile } from './turnstile';
import { randomCode } from './crypto';
import { saveLoginCode } from './auth';
import { EmailError, sendLoginCode } from './email';

const HOUR = 60 * 60;
const PER_EMAIL_PER_HOUR = 5;
const PER_IP_PER_HOUR = 20;

export type Locale = 'ru' | 'en';

export function localeOf(value: unknown): Locale {
  return value === 'en' ? 'en' : 'ru';
}

/**
 * Общий путь «прислать код»: лимит по IP, проверка email, Turnstile, лимит по email, код, письмо.
 * beforeSend выполняется после всех проверок (например, сохранить лида).
 * Ответ не зависит от того, есть ли такой пользователь.
 */
export async function startLogin(
  env: Env,
  request: Request,
  input: { email: unknown; turnstileToken: unknown; locale: Locale; ipKey: string },
  beforeSend?: (email: string) => Promise<void>,
): Promise<Response> {
  const ip = clientIp(request);
  if (!(await hit(env, `${input.ipKey}:ip:${ip}`, PER_IP_PER_HOUR, HOUR))) return json({ error: 'rate_limited' }, 429);

  const email = normalizeEmail(input.email);
  if (!email) return json({ error: 'invalid_email' }, 400);

  if (!(await verifyTurnstile(env, input.turnstileToken, ip))) return json({ error: 'captcha_failed' }, 400);

  if (!(await hit(env, `code:email:${email}`, PER_EMAIL_PER_HOUR, HOUR))) return json({ error: 'rate_limited' }, 429);

  if (beforeSend) await beforeSend(email);

  const code = randomCode();
  await saveLoginCode(env, email, code);
  try {
    await sendLoginCode(env, email, code, input.locale);
  } catch (err) {
    if (err instanceof EmailError) return json({ error: 'email_failed' }, 502);
    throw err;
  }
  return json({ ok: true });
}
