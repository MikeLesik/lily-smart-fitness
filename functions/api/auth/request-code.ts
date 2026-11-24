import type { Env } from '../../../server/env';
import { clientIp, json, normalizeEmail, readJson } from '../../../server/http';
import { hit } from '../../../server/ratelimit';
import { verifyTurnstile } from '../../../server/turnstile';
import { randomCode } from '../../../server/crypto';
import { saveLoginCode } from '../../../server/auth';
import { EmailError, sendLoginCode } from '../../../server/email';

const HOUR = 60 * 60;
const PER_EMAIL_PER_HOUR = 5;
const PER_IP_PER_HOUR = 20;

/**
 * POST { email, turnstileToken } → 200 { ok: true }.
 * Ответ не зависит от того, есть ли такой пользователь: пользователь создаётся только при вводе кода.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email: string; turnstileToken: string }>(request);
  const ip = clientIp(request);

  if (!(await hit(env, `code:ip:${ip}`, PER_IP_PER_HOUR, HOUR))) {
    return json({ error: 'rate_limited' }, 429);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);

  if (!(await verifyTurnstile(env, body.turnstileToken, ip))) {
    return json({ error: 'captcha_failed' }, 400);
  }

  if (!(await hit(env, `code:email:${email}`, PER_EMAIL_PER_HOUR, HOUR))) {
    return json({ error: 'rate_limited' }, 429);
  }

  const code = randomCode();
  await saveLoginCode(env, email, code);
  try {
    await sendLoginCode(env, email, code);
  } catch (err) {
    if (err instanceof EmailError) return json({ error: 'email_failed' }, 502);
    throw err;
  }
  return json({ ok: true });
};
