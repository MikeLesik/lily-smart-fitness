import type { Env } from '../env';
import type { CatalogVideo } from '../catalog';
import { streamProvider } from './stream';

/**
 * Что получает браузер для просмотра. Пока только iframe-плеер; ссылка подписана и живёт ttlSec.
 * Второй провайдер (например, Kinescope) должен вернуть такой же объект.
 */
export interface Playback {
  kind: 'iframe';
  url: string;
  /** Unix-время в секундах, когда ссылка перестанет работать. */
  expiresAt: number;
}

export interface VideoProvider {
  /** null, если провайдер не настроен в этой среде (нет ключей). */
  playback(providerVideoId: string, ttlSec: number): Promise<Playback | null>;
}

const providers: Record<string, (env: Env) => VideoProvider> = {
  stream: streamProvider,
};

export const PLAYBACK_TTL_SEC = 2 * 60 * 60;

export async function getPlayback(env: Env, video: CatalogVideo): Promise<Playback | null> {
  const make = providers[video.provider];
  if (!make) return null;
  return make(env).playback(video.providerVideoId, PLAYBACK_TTL_SEC);
}
