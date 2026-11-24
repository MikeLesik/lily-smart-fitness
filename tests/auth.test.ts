import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { onRequestPost as requestCode } from '../functions/api/auth/request-code';
import { onRequestPost as verifyCode } from '../functions/api/auth/verify-code';
import { onRequestPost as logout } from '../functions/api/auth/logout';
import { onRequestGet as me } from '../functions/api/me';
import { onRequest as apiMiddleware } from '../functions/api/_middleware';
import { saveLoginCode } from '../server/auth';
import { call, freshEmail, freshIp, sessionCookie } from './helpers';

async function codeRow(email: string) {
  return env.DB.prepare('SELECT * FROM login_codes WHERE email = ?').bind(email).first<{
    attempts: number;
    expires_at: number;
  }>();
}

async function createUser(email: string) {
  await env.DB.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), email, Math.floor(Date.now() / 1000))
    .run();
}

describe('POST /api/auth/request-code', () => {
  it('отвечает одинаково для существующего и нового email', async () => {
    const existing = freshEmail('existing');
    const fresh = freshEmail('new');
    await createUser(existing);

    const a = await call(requestCode, { body: { email: existing } });
    const b = await call(requestCode, { body: { email: fresh } });

    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
    expect(await codeRow(existing)).not.toBeNull();
    expect(await codeRow(fresh)).not.toBeNull();
  });

  it('не создаёт пользователя до ввода кода', async () => {
    const email = freshEmail();
    await call(requestCode, { body: { email } });
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    expect(user).toBeNull();
  });

  it('приводит email к нижнему регистру', async () => {
    const email = freshEmail();
    await call(requestCode, { body: { email: `  ${email.toUpperCase()} ` } });
    expect(await codeRow(email)).not.toBeNull();
  });

  it('отклоняет некорректный email', async () => {
    const res = await call(requestCode, { body: { email: 'not-an-email' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_email' });
  });

  it('ограничивает число кодов на один email', async () => {
    const email = freshEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push((await call(requestCode, { body: { email } })).status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it('ограничивает число запросов с одного IP', async () => {
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 21; i++) {
      last = (await call(requestCode, { ip, body: { email: freshEmail() } })).status;
    }
    expect(last).toBe(429);
  });

  it('требует Turnstile, если задан секрет', async () => {
    const res = await call(requestCode, {
      body: { email: freshEmail() },
      env: { TURNSTILE_SECRET_KEY: 'secret' },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'captcha_failed' });
  });
});

describe('POST /api/auth/verify-code', () => {
  it('неверный код: 400, попытка засчитана, cookie нет', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');

    const res = await call(verifyCode, { body: { email, code: '654321' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_code', attemptsLeft: 4 });
    expect(res.headers.get('set-cookie')).toBeNull();
    expect((await codeRow(email))?.attempts).toBe(1);
  });

  it('истёкший код не принимается, даже верный', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');
    await env.DB.prepare('UPDATE login_codes SET expires_at = ? WHERE email = ?')
      .bind(Math.floor(Date.now() / 1000) - 1, email)
      .run();

    const res = await call(verifyCode, { body: { email, code: '123456' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'code_expired' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('код живёт 10 минут', async () => {
    const email = freshEmail();
    const before = Math.floor(Date.now() / 1000);
    await saveLoginCode(env, email, '123456');
    const row = await codeRow(email);
    expect(row!.expires_at - before).toBeGreaterThanOrEqual(600);
    expect(row!.expires_at - before).toBeLessThanOrEqual(601);
  });

  it('после 5 неверных попыток код сгорает, верный уже не подходит', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');

    const results: Array<{ status: number; body: unknown }> = [];
    for (let i = 0; i < 5; i++) {
      const r = await call(verifyCode, { body: { email, code: '000000' } });
      results.push({ status: r.status, body: await r.json() });
    }
    expect(results[3]).toEqual({ status: 400, body: { error: 'invalid_code', attemptsLeft: 1 } });
    expect(results[4]).toEqual({ status: 429, body: { error: 'too_many_attempts' } });

    const res = await call(verifyCode, { body: { email, code: '123456' } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'code_expired' });
  });

  it('верный код: создаёт пользователя и ставит cookie сессии на 30 дней', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');

    const res = await call(verifyCode, { body: { email, code: '123456' } });

    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; user: { email: string } }>();
    expect(body.ok).toBe(true);
    expect(body.user.email).toBe(email);

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^lily_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=2592000');

    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    expect(user).not.toBeNull();
  });

  it('код одноразовый', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');
    expect((await call(verifyCode, { body: { email, code: '123456' } })).status).toBe(200);
    const again = await call(verifyCode, { body: { email, code: '123456' } });
    expect(again.status).toBe(400);
  });

  it('существующий пользователь входит в свой аккаунт, дубля нет', async () => {
    const email = freshEmail();
    await createUser(email);
    await saveLoginCode(env, email, '123456');
    expect((await call(verifyCode, { body: { email, code: '123456' } })).status).toBe(200);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE email = ?').bind(email).first<{ n: number }>();
    expect(count!.n).toBe(1);
  });
});

describe('сессия: /api/me и выход', () => {
  it('без cookie /api/me отвечает гостем', async () => {
    const res = await call(me);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null, entitlements: [] });
  });

  it('полный путь: код из письма, вход, /api/me с правами, выход', async () => {
    const email = freshEmail();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await call(requestCode, { body: { email } });
    const printed = log.mock.calls.map((args) => args.join(' ')).join('\n');
    log.mockRestore();
    const code = printed.match(new RegExp(`${email}.*?(\\d{6})`))?.[1];
    expect(code).toMatch(/^\d{6}$/);

    const login = await call(verifyCode, { body: { email, code } });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);

    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    await env.DB.prepare(
      "INSERT INTO entitlements (id, user_id, scope, source, status, created_at) VALUES (?, ?, 'spina', 'manual', 'active', 0)",
    )
      .bind(crypto.randomUUID(), user!.id)
      .run();

    const meRes = await call(me, { cookie });
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json<{ user: { email: string }; entitlements: Array<{ scope: string }> }>();
    expect(meBody.user.email).toBe(email);
    expect(meBody.entitlements.map((e) => e.scope)).toEqual(['spina']);

    const out = await call(logout, { cookie, body: {} });
    expect(out.status).toBe(200);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');

    expect(await (await call(me, { cookie })).json()).toEqual({ user: null, entitlements: [] });
  });

  it('истёкшая сессия не пускает', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');
    const cookie = sessionCookie(await call(verifyCode, { body: { email, code: '123456' } }));
    await env.DB.prepare('UPDATE sessions SET expires_at = 0 WHERE user_id = (SELECT id FROM users WHERE email = ?)')
      .bind(email)
      .run();
    expect((await (await call(me, { cookie })).json<{ user: unknown }>()).user).toBeNull();
  });

  it('отозванные права в /api/me не попадают', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');
    const cookie = sessionCookie(await call(verifyCode, { body: { email, code: '123456' } }));
    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
    await env.DB.prepare(
      "INSERT INTO entitlements (id, user_id, scope, source, status, created_at) VALUES (?, ?, 'all', 'manual', 'revoked', 0)",
    )
      .bind(crypto.randomUUID(), user!.id)
      .run();
    const body = await (await call(me, { cookie })).json<{ entitlements: unknown[] }>();
    expect(body.entitlements).toEqual([]);
  });
});

describe('middleware /api', () => {
  it('отклоняет POST с чужого сайта', async () => {
    const res = await call(apiMiddleware, { body: {}, origin: 'https://evil.example' });
    expect(res.status).toBe(403);
  });

  it('пропускает POST со своего сайта и запрещает кеширование', async () => {
    const res = await call(apiMiddleware, { body: {}, origin: 'https://cabinet.lily-smart-fitness.pages.dev' });
    expect(await res.text()).toBe('next');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
