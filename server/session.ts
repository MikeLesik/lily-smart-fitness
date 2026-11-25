import type { Env } from './env';
import { nowSec, type User } from './db';
import { randomToken, sha256Hex } from './crypto';

export const SESSION_COOKIE = 'lily_session';
export const SESSION_TTL_SEC = 30 * 24 * 60 * 60;

function cookie(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearSessionCookie = cookie('', 0);

function readToken(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      const value = rest.join('=');
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
    }
  }
  return null;
}

/** Создаёт сессию, возвращает заголовок Set-Cookie. */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken();
  const now = nowSec();
  await env.DB.prepare('INSERT INTO sessions (id_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, now + SESSION_TTL_SEC, now)
    .run();
  // Заодно чистим истёкшее, чтобы таблицы не росли.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM login_codes WHERE expires_at <= ?').bind(now),
  ]);
  return cookie(token, SESSION_TTL_SEC);
}

/** Пользователь и хеш его сессии: по хешу различаем устройства одного аккаунта. */
export async function getSession(env: Env, request: Request): Promise<{ user: User; sessionHash: string } | null> {
  const token = readToken(request);
  if (!token) return null;
  const sessionHash = await sha256Hex(token);
  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.locale, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = ? AND s.expires_at > ?`,
  )
    .bind(sessionHash, nowSec())
    .first<User>();
  return user ? { user, sessionHash } : null;
}

export async function getSessionUser(env: Env, request: Request): Promise<User | null> {
  return (await getSession(env, request))?.user ?? null;
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const token = readToken(request);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?').bind(await sha256Hex(token)).run();
}
