import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { onRequestGet as getCatalog } from '../functions/api/catalog';
import { onRequestGet as playback } from '../functions/api/videos/[id]/playback';
import { onRequestGet as getProgress, onRequestPost as postProgress } from '../functions/api/progress';
import { canWatch } from '../server/access';
import { catalog, type CatalogVideo } from '../server/catalog';
import type { Entitlement, User } from '../server/db';
import { call, decodeJwt, grant, loginAs, streamTestKey } from './helpers';

// Каталог тестов: фикстура с видео (tests/setup-catalog.ts).
const categories = catalog.categories;
const paid = categories.find((c) => c.published && !c.free && c.videos.some((v) => v.preview) && c.videos.some((v) => !v.preview))!;
const otherPaid = categories.find((c) => c.published && !c.free && c.slug !== paid.slug)!;
const freeCat = categories.find((c) => c.published && c.free)!;
const previewVideo = paid.videos.find((v) => v.preview)!;
const lockedVideo = paid.videos.find((v) => !v.preview)!;
const freeVideo = freeCat.videos[0];

const user: User = { id: 'u1', email: 'a@example.com', locale: 'ru', created_at: 0 };
const ent = (scope: string): Entitlement => ({ scope, source: 'manual', expires_at: null, created_at: 0 });

describe('каталог', () => {
  it('годится для тестов: платная категория с превью и закрытым видео, вторая платная, бесплатная', () => {
    expect(paid).toBeDefined();
    expect(otherPaid).toBeDefined();
    expect(freeCat).toBeDefined();
  });

  it('id видео уникальны, у каждого есть длительность и UID в видеохостинге', () => {
    const videos = categories.flatMap((c) => c.videos);
    expect(new Set(videos.map((v) => v.id)).size).toBe(videos.length);
    for (const v of videos) {
      expect(v.durationSec, v.id).toBeGreaterThan(0);
      expect(v.providerVideoId, v.id).toMatch(/^[a-f0-9]{32}$/);
    }
  });

  it('у платных категорий и наборов есть цена', () => {
    for (const c of categories.filter((c) => !c.free)) expect(c.price?.amount, c.slug).toBeGreaterThan(0);
    for (const b of catalog.bundles) expect(b.price.amount).toBeGreaterThan(0);
  });
});

describe('правило доступа (4.2)', () => {
  it('превью доступно всем, даже без входа', () => {
    expect(canWatch(previewVideo, paid, null, [])).toBe(true);
  });

  it('бесплатная категория доступна после входа', () => {
    expect(canWatch(freeVideo, freeCat, user, [])).toBe(true);
  });

  it('бесплатная категория без входа закрыта', () => {
    expect(canWatch(freeVideo, freeCat, null, [])).toBe(false);
  });

  it('право на категорию открывает её видео', () => {
    expect(canWatch(lockedVideo, paid, user, [ent(paid.slug)])).toBe(true);
  });

  it('право «все категории» открывает любое видео', () => {
    expect(canWatch(lockedVideo, paid, user, [ent('all')])).toBe(true);
  });

  it('без права платное видео закрыто', () => {
    expect(canWatch(lockedVideo, paid, user, [])).toBe(false);
    expect(canWatch(lockedVideo, paid, null, [])).toBe(false);
  });

  it('право на другую категорию не открывает эту', () => {
    expect(canWatch(lockedVideo, paid, user, [ent(otherPaid.slug)])).toBe(false);
  });
});

describe('GET /api/catalog', () => {
  it('отдаёт опубликованные категории без идентификаторов видео в хостинге', async () => {
    const res = await call(getCatalog);
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.categories.map((c: { slug: string }) => c.slug)).toEqual(
      categories.filter((c) => c.published).map((c) => c.slug),
    );
    expect(text).not.toContain('providerVideoId');
    expect(text).not.toContain('"provider"');
    for (const v of categories.flatMap((c) => c.videos)) {
      if (v.providerVideoId && v.providerVideoId.length > 8) expect(text).not.toContain(v.providerVideoId);
    }
    const lesson = body.categories.find((c: { slug: string }) => c.slug === paid.slug).videos[0];
    expect(Object.keys(lesson).sort()).toEqual(['cover', 'description', 'durationSec', 'equipment', 'id', 'preview', 'previewOf', 'ready', 'title']);
  });
});

describe('GET /api/videos/:id/playback', () => {
  async function play(video: CatalogVideo, opts: { cookie?: string; stream?: boolean } = {}) {
    const key = await streamTestKey();
    const res = await call(playback, {
      params: { id: video.id },
      cookie: opts.cookie,
      env: opts.stream === false ? {} : key.env,
    });
    return { res, key };
  }

  it('превью: гость получает подписанную ссылку на 2 часа', async () => {
    const { res, key } = await play(previewVideo);
    expect(res.status).toBe(200);
    const body = await res.json<{ kind: string; url: string; expiresAt: number }>();
    expect(body.kind).toBe('iframe');
    const m = body.url.match(/^https:\/\/customer-testcode\.cloudflarestream\.com\/([^/]+)\/iframe$/);
    expect(m).not.toBeNull();
    const jwt = decodeJwt(m![1]);
    expect(jwt.header).toMatchObject({ alg: 'RS256', kid: key.keyId });
    expect(jwt.payload.sub).toBe(previewVideo.providerVideoId);
    expect(jwt.payload.kid).toBe(key.keyId);
    const now = Math.floor(Date.now() / 1000);
    expect(jwt.payload.exp - now).toBeGreaterThanOrEqual(7190);
    expect(jwt.payload.exp - now).toBeLessThanOrEqual(7200);
    expect(body.expiresAt).toBe(jwt.payload.exp);
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key.publicKey,
      jwt.signature,
      new TextEncoder().encode(jwt.signingInput),
    );
    expect(valid).toBe(true);
  });

  it('закрытое видео без входа: 401', async () => {
    const { res } = await play(lockedVideo);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'login_required' });
  });

  it('закрытое видео без права: 403', async () => {
    const { cookie } = await loginAs();
    const { res } = await play(lockedVideo, { cookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('право выдано вручную в базе: 200', async () => {
    const { cookie, userId } = await loginAs();
    await grant(userId, paid.slug);
    const { res } = await play(lockedVideo, { cookie });
    expect(res.status).toBe(200);
  });

  it('право «all»: 200', async () => {
    const { cookie, userId } = await loginAs();
    await grant(userId, 'all');
    expect((await play(lockedVideo, { cookie })).res.status).toBe(200);
  });

  it('отозванное и истёкшее право: 403', async () => {
    const a = await loginAs();
    await grant(a.userId, paid.slug, { status: 'revoked' });
    expect((await play(lockedVideo, { cookie: a.cookie })).res.status).toBe(403);
    const b = await loginAs();
    await grant(b.userId, paid.slug, { expiresAt: 1 });
    expect((await play(lockedVideo, { cookie: b.cookie })).res.status).toBe(403);
  });

  it('бесплатная категория: гостю 401, после входа 200', async () => {
    expect((await play(freeVideo)).res.status).toBe(401);
    const { cookie } = await loginAs();
    expect((await play(freeVideo, { cookie })).res.status).toBe(200);
  });

  it('неизвестное видео: 404', async () => {
    const res = await call(playback, { params: { id: 'nope' } });
    expect(res.status).toBe(404);
  });

  it('видеохостинг не настроен: 503', async () => {
    const { res } = await play(previewVideo, { stream: false });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'video_unavailable' });
  });
});

describe('/api/progress', () => {
  it('гость не может сохранять прогресс', async () => {
    const res = await call(postProgress, { body: { videoId: freeVideo.id, seconds: 10 } });
    expect(res.status).toBe(401);
  });

  it('гостю GET отдаёт пустой список', async () => {
    const res = await call(getProgress);
    expect(await res.json()).toEqual({ progress: [] });
  });

  it('сохраняет позицию и отдаёт её обратно', async () => {
    const { cookie } = await loginAs();
    expect((await call(postProgress, { cookie, body: { videoId: freeVideo.id, seconds: 12.7 } })).status).toBe(200);
    const body = await (await call(getProgress, { cookie })).json();
    expect(body).toEqual({ progress: [{ videoId: freeVideo.id, seconds: 12, completed: false }] });
  });

  it('досмотренное видео остаётся отмеченным, даже если пересмотреть сначала', async () => {
    const { cookie } = await loginAs();
    await call(postProgress, { cookie, body: { videoId: freeVideo.id, seconds: freeVideo.durationSec, completed: true } });
    await call(postProgress, { cookie, body: { videoId: freeVideo.id, seconds: 3 } });
    const body = await (await call(getProgress, { cookie })).json<{ progress: Array<{ seconds: number; completed: boolean }> }>();
    expect(body.progress[0]).toEqual({ videoId: freeVideo.id, seconds: 3, completed: true });
  });

  it('90% длительности считается досмотренным', async () => {
    const { cookie } = await loginAs();
    await call(postProgress, { cookie, body: { videoId: freeVideo.id, seconds: Math.ceil(freeVideo.durationSec! * 0.9) } });
    const body = await (await call(getProgress, { cookie })).json<{ progress: Array<{ completed: boolean }> }>();
    expect(body.progress[0].completed).toBe(true);
  });

  it('нельзя писать прогресс закрытого видео', async () => {
    const { cookie } = await loginAs();
    const res = await call(postProgress, { cookie, body: { videoId: lockedVideo.id, seconds: 5 } });
    expect(res.status).toBe(403);
  });

  it('неизвестное видео и мусор отклоняются', async () => {
    const { cookie } = await loginAs();
    expect((await call(postProgress, { cookie, body: { videoId: 'nope', seconds: 5 } })).status).toBe(404);
    expect((await call(postProgress, { cookie, body: { videoId: freeVideo.id, seconds: -1 } })).status).toBe(400);
    expect((await call(postProgress, { cookie, body: { videoId: freeVideo.id, seconds: 'x' } })).status).toBe(400);
  });
});
