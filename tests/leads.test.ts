import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as leads } from '../functions/api/leads';
import { onRequestPost as requestCode } from '../functions/api/auth/request-code';
import { onRequestPost as verifyCode } from '../functions/api/auth/verify-code';
import { saveLoginCode } from '../server/auth';
import { call, freshEmail, freshIp } from './helpers';

afterEach(() => vi.restoreAllMocks());

function captureLog() {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return () => log.mock.calls.map((a) => a.join(' ')).join('\n');
}

async function userRow(email: string) {
  return env.DB.prepare('SELECT id, locale, marketing_consent, utm_source, utm_medium, utm_campaign FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; locale: string; marketing_consent: number; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null }>();
}

async function freeRights(email: string) {
  const { results } = await env.DB.prepare(
    "SELECT e.scope, e.source, e.status FROM entitlements e JOIN users u ON u.id = e.user_id WHERE u.email = ?",
  )
    .bind(email)
    .all();
  return results;
}

describe('POST /api/leads', () => {
  it('создаёт пользователя с согласием, UTM и языком, выдаёт право free и шлёт код', async () => {
    const email = freshEmail('lead');
    const out = captureLog();
    const res = await call(leads, {
      body: { email, consent: true, locale: 'en', utm: { utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'nov' } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await userRow(email)).toMatchObject({
      locale: 'en',
      marketing_consent: 1,
      utm_source: 'instagram',
      utm_medium: 'bio',
      utm_campaign: 'nov',
    });
    expect(await freeRights(email)).toEqual([{ scope: 'free', source: 'free', status: 'active' }]);
    expect(out()).toMatch(new RegExp(`${email}[\\s\\S]*\\d{6}`));
  });

  it('повторная заявка не дублирует право, не снимает согласие и не перезаписывает первое касание', async () => {
    const email = freshEmail('lead');
    captureLog();
    await call(leads, { body: { email, consent: true, utm: { utm_source: 'instagram' } } });
    await call(leads, { body: { email, consent: false, utm: { utm_source: 'google' } } });
    expect(await freeRights(email)).toHaveLength(1);
    expect(await userRow(email)).toMatchObject({ marketing_consent: 1, utm_source: 'instagram' });
  });

  it('ответ одинаковый для нового и существующего пользователя', async () => {
    captureLog();
    const existing = freshEmail('old');
    await env.DB.prepare('INSERT INTO users (id, email, created_at) VALUES (?, ?, 0)').bind(crypto.randomUUID(), existing).run();
    const a = await call(leads, { body: { email: existing } });
    const b = await call(leads, { body: { email: freshEmail('new') } });
    expect(a.status).toBe(200);
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
  });

  it('некорректный email 400, без Turnstile при заданном секрете 400', async () => {
    expect((await call(leads, { body: { email: 'nope' } })).status).toBe(400);
    const res = await call(leads, { body: { email: freshEmail() }, env: { TURNSTILE_SECRET_KEY: 'x' } });
    expect(await res.json()).toEqual({ error: 'captcha_failed' });
  });

  it('лимит заявок с одного IP', async () => {
    captureLog();
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await call(leads, { ip, body: { email: freshEmail() } })).status;
    expect(last).toBe(429);
  });
});

describe('язык писем и пользователя', () => {
  it('request-code с locale en шлёт английское письмо', async () => {
    const out = captureLog();
    await call(requestCode, { body: { email: freshEmail(), locale: 'en' } });
    expect(out()).toContain('Your sign-in code');
  });

  it('по умолчанию письмо на русском', async () => {
    const out = captureLog();
    await call(requestCode, { body: { email: freshEmail() } });
    expect(out()).toContain('Код для входа');
  });

  it('verify-code с locale en создаёт пользователя с языком en', async () => {
    const email = freshEmail();
    await saveLoginCode(env, email, '123456');
    await call(verifyCode, { body: { email, code: '123456', locale: 'en' } });
    expect((await userRow(email))!.locale).toBe('en');
  });
});
