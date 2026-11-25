import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { onRequestGet as me } from '../functions/api/me';
import { catalog, setCatalogForTests, type Catalog } from '../server/catalog';
import { receiptNumber } from '../server/orders';
import { call, loginAs } from './helpers';

// Свой чек в кабинете: /api/me отдаёт по заказу id, номер чека и название программы.

const fixture: Catalog = structuredClone(catalog);
afterEach(() => setCatalogForTests(fixture));

type OrderOut = { id: string; number: string; scope: string; title: { ru: string; en?: string } | null; amount: number; currency: string; status: string; createdAt: number };

async function addOrder(userId: string, email: string, scope: string, id = crypto.randomUUID()) {
  await env.DB.prepare(
    "INSERT INTO orders (id, user_id, email, stripe_session_id, amount, currency, items, status, receipt_url, created_at) VALUES (?, ?, ?, ?, 5900, 'eur', ?, 'paid', 'https://pay.stripe.com/receipts/x', 1795000000)",
  )
    .bind(id, userId, email, `cs_test_${id}`, JSON.stringify([scope]))
    .run();
  return id;
}

async function orders(cookie: string): Promise<OrderOut[]> {
  return (await (await call(me, { cookie })).json<{ orders: OrderOut[] }>()).orders;
}

describe('чек в кабинете', () => {
  it('номер чека: первые 8 шестнадцатеричных знаков id заказа, двумя четвёрками', () => {
    expect(receiptNumber('1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBe('1A2B-3C4D');
  });

  it('заказ приходит с id, номером, суммой, датой и названием программы', async () => {
    const u = await loginAs();
    const id = await addOrder(u.userId, u.email, 'postpartum', '0f9e8d7c-1111-4222-8333-444455556666');
    const list = await orders(u.cookie);
    expect(list).toEqual([
      {
        id,
        number: '0F9E-8D7C',
        scope: 'postpartum',
        title: catalog.categories.find((c) => c.slug === 'postpartum')!.title,
        amount: 5900,
        currency: 'eur',
        status: 'paid',
        createdAt: 1795000000,
      },
    ]);
  });

  it('программа снята с сайта: название в чеке остаётся', async () => {
    const u = await loginAs();
    await addOrder(u.userId, u.email, 'zaryadka');
    const title = catalog.categories.find((c) => c.slug === 'zaryadka')!.title;
    const hidden = structuredClone(fixture);
    hidden.categories.find((c) => c.slug === 'zaryadka')!.published = false;
    setCatalogForTests(hidden);
    expect((await orders(u.cookie))[0].title).toEqual(title);
  });

  it('набор и неизвестная область', async () => {
    const u = await loginAs();
    await addOrder(u.userId, u.email, 'all');
    await addOrder(u.userId, u.email, 'gone-program');
    const list = await orders(u.cookie);
    expect(list.find((o) => o.scope === 'all')!.title).toEqual(catalog.bundles.find((b) => b.slug === 'all')!.title);
    expect(list.find((o) => o.scope === 'gone-program')!.title).toBeNull();
  });

  it('чужие заказы не видны', async () => {
    const a = await loginAs();
    const b = await loginAs();
    await addOrder(a.userId, a.email, 'postpartum');
    expect(await orders(b.cookie)).toEqual([]);
  });
});
