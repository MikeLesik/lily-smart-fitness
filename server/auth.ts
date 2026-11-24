import type { Env } from './env';
import { nowSec } from './db';
import { hmacHex, safeEqual } from './crypto';

export const CODE_TTL_SEC = 10 * 60;
export const MAX_CODE_ATTEMPTS = 5;

function hashCode(env: Env, email: string, code: string): Promise<string> {
  return hmacHex(env.AUTH_SECRET, `${email}:${code}`);
}

/** Сохраняет код для email, заменяя предыдущий. */
export async function saveLoginCode(env: Env, email: string, code: string): Promise<void> {
  const now = nowSec();
  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?1, ?2, ?3, 0, ?4)
     ON CONFLICT(email) DO UPDATE SET code_hash = ?2, expires_at = ?3, attempts = 0, created_at = ?4`,
  )
    .bind(email, await hashCode(env, email, code), now + CODE_TTL_SEC, now)
    .run();
}

export type CodeCheck =
  | { ok: true }
  | { ok: false; error: 'code_expired' }
  | { ok: false; error: 'invalid_code'; attemptsLeft: number }
  | { ok: false; error: 'too_many_attempts' };

/** Проверяет код. Верный, истёкший или исчерпанный код удаляется. */
export async function checkLoginCode(env: Env, email: string, code: string): Promise<CodeCheck> {
  const row = await env.DB.prepare('SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ?')
    .bind(email)
    .first<{ code_hash: string; expires_at: number; attempts: number }>();

  if (!row || row.expires_at <= nowSec() || row.attempts >= MAX_CODE_ATTEMPTS) {
    if (row) await deleteCode(env, email);
    return { ok: false, error: 'code_expired' };
  }

  if (safeEqual(row.code_hash, await hashCode(env, email, code))) {
    await deleteCode(env, email);
    return { ok: true };
  }

  const attempts = row.attempts + 1;
  if (attempts >= MAX_CODE_ATTEMPTS) {
    await deleteCode(env, email);
    return { ok: false, error: 'too_many_attempts' };
  }
  await env.DB.prepare('UPDATE login_codes SET attempts = ? WHERE email = ?').bind(attempts, email).run();
  return { ok: false, error: 'invalid_code', attemptsLeft: MAX_CODE_ATTEMPTS - attempts };
}

async function deleteCode(env: Env, email: string): Promise<void> {
  await env.DB.prepare('DELETE FROM login_codes WHERE email = ?').bind(email).run();
}
