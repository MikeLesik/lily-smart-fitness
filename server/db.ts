import type { Env } from './env';

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export interface User {
  id: string;
  email: string;
  locale: string;
  created_at: number;
}

export interface Entitlement {
  scope: string;
  source: 'stripe' | 'manual' | 'free';
  expires_at: number | null;
  created_at: number;
}

export async function getUserByEmail(env: Env, email: string): Promise<User | null> {
  return env.DB.prepare('SELECT id, email, locale, created_at FROM users WHERE email = ?').bind(email).first<User>();
}

export async function getOrCreateUser(env: Env, email: string, locale = 'ru'): Promise<User> {
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, locale, created_at) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), email, locale, nowSec())
    .run();
  const user = await getUserByEmail(env, email);
  if (!user) throw new Error('user upsert failed');
  return user;
}

/**
 * Истёкшие права (active, но срок прошёл) по областям, где действующего права нет: самый поздний срок.
 * Кабинет показывает «Доступ закончился …» и «Купить снова».
 */
export async function getExpiredEntitlements(env: Env, userId: string): Promise<Array<{ scope: string; expires_at: number }>> {
  const now = nowSec();
  const { results } = await env.DB.prepare(
    `SELECT scope, MAX(expires_at) AS expires_at FROM entitlements
     WHERE user_id = ?1 AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?2
       AND scope NOT IN (SELECT scope FROM entitlements WHERE user_id = ?1 AND status = 'active' AND (expires_at IS NULL OR expires_at > ?2))
     GROUP BY scope ORDER BY scope`,
  )
    .bind(userId, now)
    .all<{ scope: string; expires_at: number }>();
  return results;
}

/** Действующие права: active и не истёкшие. */
export async function getActiveEntitlements(env: Env, userId: string): Promise<Entitlement[]> {
  const { results } = await env.DB.prepare(
    `SELECT scope, source, expires_at, created_at FROM entitlements
     WHERE user_id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)
     ORDER BY created_at, scope`,
  )
    .bind(userId, nowSec())
    .all<Entitlement>();
  return results;
}
