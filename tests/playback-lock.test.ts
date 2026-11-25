import { describe, expect, it } from 'vitest';
import { onRequestGet as playback } from '../functions/api/videos/[id]/playback';
import { onRequestPost as heartbeat } from '../functions/api/videos/[id]/heartbeat';
import { catalog } from '../server/catalog';
import { call, grant, loginAs, streamTestKey } from './helpers';

// Один аккаунт смотрит платное видео только на одном устройстве: устройство = сессия.
// Кто открыл видео последним, тот и смотрит; прежнее устройство узнаёт об этом из heartbeat.

const paid = catalog.categories.find((c) => c.published && !c.free && c.videos.some((v) => v.preview) && c.videos.some((v) => !v.preview))!;
const paidVideo = paid.videos.find((v) => !v.preview)!;
const previewVideo = paid.videos.find((v) => v.preview)!;
const freeVideo = catalog.categories.find((c) => c.published && c.free)!.videos[0];

async function open(videoId: string, cookie?: string) {
  const key = await streamTestKey();
  return call(playback, { cookie, params: { id: videoId }, env: key.env });
}

async function beat(videoId: string, cookie?: string) {
  const res = await call(heartbeat, { method: 'POST', body: {}, cookie, params: { id: videoId } });
  return { status: res.status, data: (await res.json()) as { active?: boolean; error?: string } };
}

/** Покупательница с двумя устройствами: два входа под одним email. */
async function twoDevices() {
  const a = await loginAs();
  const b = await loginAs(a.email);
  await grant(a.userId, paid.slug);
  return { a: a.cookie, b: b.cookie, userId: a.userId };
}

describe('одно устройство на аккаунт', () => {
  it('устройство, открывшее видео, остаётся активным', async () => {
    const { a } = await twoDevices();
    expect((await open(paidVideo.id, a)).status).toBe(200);
    expect(await beat(paidVideo.id, a)).toEqual({ status: 200, data: { active: true } });
  });

  it('второе устройство перехватывает просмотр, первое узнаёт об этом', async () => {
    const { a, b } = await twoDevices();
    await open(paidVideo.id, a);
    expect((await open(paidVideo.id, b)).status).toBe(200);
    expect((await beat(paidVideo.id, a)).data).toEqual({ active: false });
    expect((await beat(paidVideo.id, b)).data).toEqual({ active: true });
  });

  it('первое устройство может вернуть просмотр себе', async () => {
    const { a, b } = await twoDevices();
    await open(paidVideo.id, a);
    await open(paidVideo.id, b);
    await open(paidVideo.id, a);
    expect((await beat(paidVideo.id, a)).data).toEqual({ active: true });
    expect((await beat(paidVideo.id, b)).data).toEqual({ active: false });
  });

  it('превью и бесплатный урок на другом устройстве просмотр не перехватывают', async () => {
    const { a, b } = await twoDevices();
    await open(paidVideo.id, a);
    expect((await open(previewVideo.id, b)).status).toBe(200);
    expect((await open(freeVideo.id, b)).status).toBe(200);
    expect((await beat(paidVideo.id, a)).data).toEqual({ active: true });
  });

  it('heartbeat для превью и бесплатного урока всегда активен', async () => {
    const { a, b } = await twoDevices();
    await open(paidVideo.id, a);
    expect((await beat(previewVideo.id, b)).data).toEqual({ active: true });
    expect((await beat(freeVideo.id, b)).data).toEqual({ active: true });
  });

  it('отказ в доступе просмотр не перехватывает', async () => {
    const { a } = await twoDevices();
    await open(paidVideo.id, a);
    const stranger = await loginAs();
    expect((await open(paidVideo.id, stranger.cookie)).status).toBe(403);
    expect((await beat(paidVideo.id, a)).data).toEqual({ active: true });
  });

  it('разные аккаунты друг другу не мешают', async () => {
    const first = await twoDevices();
    const second = await twoDevices();
    await open(paidVideo.id, first.a);
    await open(paidVideo.id, second.a);
    expect((await beat(paidVideo.id, first.a)).data).toEqual({ active: true });
    expect((await beat(paidVideo.id, second.a)).data).toEqual({ active: true });
  });

  it('пока никто не открывал видео, heartbeat активен', async () => {
    const { a } = await twoDevices();
    expect((await beat(paidVideo.id, a)).data).toEqual({ active: true });
  });

  it('без входа 401, неизвестное видео 404', async () => {
    const { a } = await twoDevices();
    expect(await beat(paidVideo.id)).toEqual({ status: 401, data: { error: 'login_required' } });
    expect(await beat('no-such-video', a)).toEqual({ status: 404, data: { error: 'not_found' } });
  });
});
