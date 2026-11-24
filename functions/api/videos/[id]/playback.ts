import type { Env } from '../../../../server/env';
import { json } from '../../../../server/http';
import { findVideo } from '../../../../server/catalog';
import { canWatch } from '../../../../server/access';
import { getActiveEntitlements } from '../../../../server/db';
import { getSessionUser } from '../../../../server/session';
import { getPlayback } from '../../../../server/video-provider';

/**
 * GET → { kind: 'iframe', url, expiresAt } (подписанная ссылка на 2 часа).
 * 401 login_required, 403 forbidden, 404 not_found, 503 video_unavailable.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  const found = findVideo(id);
  if (!found) return json({ error: 'not_found' }, 404);

  const user = await getSessionUser(env, request);
  const entitlements = user ? await getActiveEntitlements(env, user.id) : [];
  if (!canWatch(found.video, found.category, user, entitlements)) {
    return user ? json({ error: 'forbidden' }, 403) : json({ error: 'login_required' }, 401);
  }

  const playback = await getPlayback(env, found.video);
  if (!playback) return json({ error: 'video_unavailable' }, 503);
  return json(playback);
};
