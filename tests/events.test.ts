import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequestPost as events } from '../functions/api/events';
import { call, freshIp, loginAs } from './helpers';

afterEach(() => vi.restoreAllMocks());

const PH = { POSTHOG_KEY: 'phc_test', POSTHOG_HOST: 'https://eu.i.posthog.com' };

function posthogMock() {
  const sent: any[] = [];
  const original = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    if (new URL(req.url).hostname === 'eu.i.posthog.com') {
      sent.push(await req.json());
      return new Response('{"status":"Ok"}');
    }
    return original(input as RequestInfo, init);
  });
  return sent;
}

describe('POST /api/events', () => {
  it('page_view уходит в PostHog как $pageview с путём, UTM и без персоны для гостя', async () => {
    const sent = posthogMock();
    const res = await call(events, {
      env: PH,
      headers: { 'user-agent': 'TestUA/1.0' },
      body: { event: 'page_view', props: { path: '/programs/yagodicy/', referrer: 'https://l.instagram.com/x', locale: 'ru', utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'nov' } },
    });
    expect(res.status).toBe(204);
    expect(sent).toHaveLength(1);
    const e = sent[0];
    expect(e.event).toBe('$pageview');
    expect(e.distinct_id).toMatch(/^anon_[a-f0-9]{32}$/);
    expect(e.properties).toMatchObject({
      $current_url: 'https://cabinet.lily-smart-fitness.pages.dev/programs/yagodicy/',
      $pathname: '/programs/yagodicy/',
      $referring_domain: 'l.instagram.com',
      $raw_user_agent: 'TestUA/1.0',
      $process_person_profile: false,
      slug: 'yagodicy',
      locale: 'ru',
      utm_source: 'instagram',
      utm_medium: 'bio',
      utm_campaign: 'nov',
    });
  });

  it('анонимный id одинаковый для того же IP и браузера, разный для другого IP', async () => {
    const sent = posthogMock();
    const ip = freshIp();
    const ua = { 'user-agent': 'Same/1' };
    await call(events, { env: PH, ip, headers: ua, body: { event: 'page_view', props: { path: '/' } } });
    await call(events, { env: PH, ip, headers: ua, body: { event: 'checkout_start', props: { slug: 'zaryadka' } } });
    await call(events, { env: PH, ip: freshIp(), headers: ua, body: { event: 'page_view', props: { path: '/' } } });
    expect(sent[0].distinct_id).toBe(sent[1].distinct_id);
    expect(sent[2].distinct_id).not.toBe(sent[0].distinct_id);
  });

  it('вошедшая: distinct_id = id пользователя, как у purchase с сервера', async () => {
    const sent = posthogMock();
    const { cookie, userId } = await loginAs();
    await call(events, { env: PH, cookie, body: { event: 'video_start', props: { slug: 'yagodicy', video_id: 'yagodicy-01' } } });
    expect(sent[0].distinct_id).toBe(userId);
    expect(sent[0].properties.$process_person_profile).toBe(true);
    expect(sent[0].properties).toMatchObject({ slug: 'yagodicy', video_id: 'yagodicy-01' });
  });

  it('только события из плана; лишние свойства отбрасываются', async () => {
    const sent = posthogMock();
    expect((await call(events, { env: PH, body: { event: 'purchase', props: {} } })).status).toBe(400);
    expect((await call(events, { env: PH, body: { event: 'hack' } })).status).toBe(400);
    await call(events, { env: PH, body: { event: 'lead_submit', props: { slug: 'free', email: 'x@example.com', evil: '<script>' } } });
    expect(sent).toHaveLength(1);
    expect(sent[0].properties.email).toBeUndefined();
    expect(sent[0].properties.evil).toBeUndefined();
  });

  it('без POSTHOG_KEY отвечает 204 и ничего не отправляет', async () => {
    const sent = posthogMock();
    expect((await call(events, { body: { event: 'page_view', props: { path: '/' } } })).status).toBe(204);
    expect(sent).toEqual([]);
  });
});
