import type { CatalogCategory, CatalogVideo } from './catalog';
import { nowSec } from './db';
import type { Env } from './env';

/**
 * Один аккаунт смотрит платное видео только на одном устройстве. Устройство = сессия входа.
 * Правило «последний открывший смотрит»: выдача ссылки на платное видео записывает сессию,
 * прежнее устройство узнаёт о перехвате из heartbeat и убирает плеер.
 * Ссылка Stream живёт 2 часа, сервер её не отзывает: это ограничение для обычного зрителя,
 * а не защита от того, кто нарочно глушит запросы кабинета.
 */

/** Правило действует на платные видео: не превью и не бесплатная категория (как и водяной знак). */
export function isSingleDeviceVideo(video: CatalogVideo, category: CatalogCategory): boolean {
  return !video.preview && !category.free;
}

/** Эта сессия теперь смотрит. Вызывается при выдаче ссылки на платное видео. */
export async function claimPlayback(env: Env, userId: string, sessionHash: string, videoId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO playback_holders (user_id, session_hash, video_id, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET session_hash = excluded.session_hash, video_id = excluded.video_id, updated_at = excluded.updated_at`,
  )
    .bind(userId, sessionHash, videoId, nowSec())
    .run();
}

/** Не перехватило ли просмотр другое устройство. Пока никто не смотрел, ответ «да». */
export async function isPlaybackHolder(env: Env, userId: string, sessionHash: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT session_hash FROM playback_holders WHERE user_id = ?')
    .bind(userId)
    .first<{ session_hash: string }>();
  return !row || row.session_hash === sessionHash;
}
