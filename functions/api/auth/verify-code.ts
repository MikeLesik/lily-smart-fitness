import type { Env } from '../../../server/env';
import { clientIp, json, normalizeEmail, readJson } from '../../../server/http';
import { hit } from '../../../server/ratelimit';
import { checkLoginCode } from '../../../server/auth';
import { getOrCreateUser } from '../../../server/db';
import { createSession } from '../../../server/session';

const HOUR = 60 * 60;
const PER_IP_PER_HOUR = 60;

/**
 * POST { email, code } → 200 { ok, user } + cookie сессии.
 * Ошибки: invalid_code (с attemptsLeft), code_expired, too_many_attempts (429), rate_limited (429).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email: string; code: string }>(request);

  if (!(await hit(env, `verify:ip:${clientIp(request)}`, PER_IP_PER_HOUR, HOUR))) {
    return json({ error: 'rate_limited' }, 429);
  }

  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);
  const code = typeof body.code === 'string' ? body.code.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(code)) return json({ error: 'invalid_code_format' }, 400);

  const check = await checkLoginCode(env, email, code);
  if (!check.ok) {
    const { ok: _ok, ...error } = check;
    return json(error, check.error === 'too_many_attempts' ? 429 : 400);
  }

  const user = await getOrCreateUser(env, email);
  const setCookie = await createSession(env, user.id);
  return json({ ok: true, user: { id: user.id, email: user.email } }, 200, { 'set-cookie': setCookie });
};
