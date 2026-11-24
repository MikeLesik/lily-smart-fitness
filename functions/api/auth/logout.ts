import type { Env } from '../../../server/env';
import { json } from '../../../server/http';
import { clearSessionCookie, destroySession } from '../../../server/session';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  await destroySession(env, request);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie });
};
