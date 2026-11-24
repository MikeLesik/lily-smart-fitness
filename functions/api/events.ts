import type { Env } from '../../server/env';
import { clientIp, json, readJson } from '../../server/http';
import { getSessionUser } from '../../server/session';
import { hit } from '../../server/ratelimit';
import { hmacHex } from '../../server/crypto';
import { capture } from '../../server/analytics';

/** События из плана (5.5), которые шлёт браузер. purchase отправляет только сервер. */
const EVENTS: Record<string, string> = {
  page_view: '$pageview',
  lead_submit: 'lead_submit',
  login_code_sent: 'login_code_sent',
  login_success: 'login_success',
  preview_play: 'preview_play',
  checkout_start: 'checkout_start',
  video_start: 'video_start',
  video_complete: 'video_complete',
};

const PROPS = ['slug', 'video_id', 'locale', 'utm_source', 'utm_medium', 'utm_campaign'] as const;

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * POST { event, props } → 204. Прокси событий в PostHog без скрипта PostHog и без cookie:
 * гость = анонимный id из хеша IP + браузера с солью дня (меняется каждый день, на устройстве ничего не хранится),
 * вошедшая = id пользователя (тот же, что у purchase с сервера).
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const body = await readJson<{ event: string; props: Record<string, unknown> }>(request);
  const name = typeof body.event === 'string' ? EVENTS[body.event] : undefined;
  if (!name) return json({ error: 'unknown_event' }, 400);
  if (!env.POSTHOG_KEY) return new Response(null, { status: 204 });

  const ip = clientIp(request);
  if (!(await hit(env, `events:ip:${ip}`, 600, 60 * 60))) return new Response(null, { status: 204 });

  const raw = body.props && typeof body.props === 'object' ? body.props : {};
  const props: Record<string, unknown> = {};
  for (const k of PROPS) {
    const v = str(raw[k], 100);
    if (v) props[k] = v;
  }

  const origin = new URL(request.url).origin;
  const path = str(raw.path, 300);
  if (path && path.startsWith('/')) {
    props.$current_url = origin + path;
    const pathname = path.split('?')[0];
    props.$pathname = pathname;
    const program = /^\/(?:en\/)?programs\/([\w-]+)\/?$/.exec(pathname);
    if (program && !props.slug) props.slug = program[1];
  }
  const referrer = str(raw.referrer, 500);
  if (referrer) {
    try {
      const ref = new URL(referrer);
      props.$referrer = referrer;
      props.$referring_domain = ref.hostname;
    } catch {
      /* не URL: пропускаем */
    }
  }
  const ua = request.headers.get('user-agent');
  if (ua) props.$raw_user_agent = ua.slice(0, 400);
  props.$ip = ip;

  const user = await getSessionUser(env, request);
  let distinctId: string;
  if (user) {
    distinctId = user.id;
    props.$process_person_profile = true;
  } else {
    const day = new Date().toISOString().slice(0, 10);
    distinctId = 'anon_' + (await hmacHex(`${env.AUTH_SECRET}:${day}`, `${ip}|${ua ?? ''}`)).slice(0, 32);
    props.$process_person_profile = false;
  }

  const send = capture(env, name, distinctId, props);
  if (typeof waitUntil === 'function') waitUntil(send);
  await send;
  return new Response(null, { status: 204 });
};
