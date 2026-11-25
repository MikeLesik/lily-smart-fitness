import type { Env } from '../../../../server/env';
import { json } from '../../../../server/http';
import { findVideo } from '../../../../server/catalog';
import { getSession } from '../../../../server/session';
import { isPlaybackHolder, isSingleDeviceVideo } from '../../../../server/playback-lock';

/**
 * POST → { active: boolean }. Кабинет спрашивает раз в 30 секунд, пока открыт плеер платного видео.
 * active: false значит, что это же видео или другое платное открыли на другом устройстве аккаунта.
 * 401 login_required, 404 not_found.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = typeof params.id === 'string' ? params.id : '';
  const found = findVideo(id);
  if (!found) return json({ error: 'not_found' }, 404);

  const session = await getSession(env, request);
  if (!session) return json({ error: 'login_required' }, 401);

  if (!isSingleDeviceVideo(found.video, found.category)) return json({ active: true });
  return json({ active: await isPlaybackHolder(env, session.user.id, session.sessionHash) });
};
