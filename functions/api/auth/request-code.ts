import type { Env } from '../../../server/env';
import { readJson } from '../../../server/http';
import { localeOf, startLogin } from '../../../server/login-flow';

/**
 * POST { email, turnstileToken, locale? } → 200 { ok: true }.
 * Ответ не зависит от того, есть ли такой пользователь: пользователь создаётся только при вводе кода.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const body = await readJson<{ email: string; turnstileToken: string; locale: string }>(request);
  return startLogin(env, request, {
    email: body.email,
    turnstileToken: body.turnstileToken,
    locale: localeOf(body.locale),
    ipKey: 'code',
  });
};
