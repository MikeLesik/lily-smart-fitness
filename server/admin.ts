import type { Env } from './env';
import type { User } from './db';
import { json } from './http';
import { getSessionUser } from './session';

/** Админы задаются секретом ADMIN_EMAILS (через запятую). Пустой список = админов нет. */
export function adminEmails(env: Env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Пользователь-админ или готовый ответ 401/403. */
export async function requireAdmin(env: Env, request: Request): Promise<User | Response> {
  const user = await getSessionUser(env, request);
  if (!user) return json({ error: 'login_required' }, 401);
  if (!adminEmails(env).includes(user.email.toLowerCase())) return json({ error: 'forbidden' }, 403);
  return user;
}

/** Ячейка CSV: кавычки удвоены, формулы (=, +, -, @) не исполнятся в Excel/Sheets. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(header: string[], rows: unknown[][], filename: string): Response {
  const body = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
