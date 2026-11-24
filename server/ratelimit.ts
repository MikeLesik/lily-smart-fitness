import type { Env } from './env';
import { nowSec } from './db';

/**
 * Фиксированное окно в D1. Возвращает true, если запрос укладывается в лимит.
 * Счётчик растёт и у отклонённых запросов.
 */
export async function hit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  const now = nowSec();
  const windowStart = now - (now % windowSec);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start = ?2 THEN count + 1 ELSE 1 END,
       window_start = ?2
     RETURNING count`,
  )
    .bind(key, windowStart)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}
