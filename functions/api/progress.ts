import type { Env } from '../../server/env';
import { json, readJson } from '../../server/http';
import { findVideo } from '../../server/catalog';
import { canWatch } from '../../server/access';
import { getActiveEntitlements, nowSec } from '../../server/db';
import { getSessionUser } from '../../server/session';

/** Досмотренным считаем видео, просмотренное на 90%. */
const COMPLETE_RATIO = 0.9;

/** GET → { progress: [{ videoId, seconds, completed }] }. Гостю пустой список. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return json({ progress: [] });
  const { results } = await env.DB.prepare(
    'SELECT video_id, seconds, completed FROM progress WHERE user_id = ? ORDER BY updated_at DESC',
  )
    .bind(user.id)
    .all<{ video_id: string; seconds: number; completed: number }>();
  return json({
    progress: results.map((r) => ({ videoId: r.video_id, seconds: r.seconds, completed: r.completed === 1 })),
  });
};

/** POST { videoId, seconds, completed? } → { ok: true }. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'login_required' }, 401);

  const body = await readJson<{ videoId: string; seconds: number; completed: boolean }>(request);
  const found = typeof body.videoId === 'string' ? findVideo(body.videoId) : null;
  if (!found) return json({ error: 'not_found' }, 404);
  if (typeof body.seconds !== 'number' || !Number.isFinite(body.seconds) || body.seconds < 0) {
    return json({ error: 'invalid_seconds' }, 400);
  }

  const entitlements = await getActiveEntitlements(env, user.id);
  if (!canWatch(found.video, found.category, user, entitlements)) return json({ error: 'forbidden' }, 403);

  const duration = found.video.durationSec;
  const seconds = Math.min(Math.floor(body.seconds), duration);
  const completed = body.completed === true || seconds >= duration * COMPLETE_RATIO ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO progress (user_id, video_id, seconds, completed, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(user_id, video_id) DO UPDATE SET
       seconds = ?3, completed = MAX(completed, ?4), updated_at = ?5`,
  )
    .bind(user.id, found.video.id, seconds, completed, nowSec())
    .run();
  return json({ ok: true });
};
