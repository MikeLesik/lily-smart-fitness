import { describe, expect, it } from 'vitest';
import { onRequestGet as sitemap } from '../functions/sitemap.xml';
import { publishedCategories } from '../server/catalog';
import { call } from './helpers';

describe('GET /sitemap.xml', () => {
  it('содержит главную, программы из каталога и бесплатный урок на двух языках', async () => {
    const res = await call(sitemap);
    expect(res.headers.get('content-type')).toContain('application/xml');
    const xml = await res.text();
    for (const path of ['/', '/en/', '/programs/', '/en/programs/', '/free/', '/en/free/']) {
      expect(xml).toContain(`<loc>https://lily.coach${path}</loc>`);
    }
    for (const c of publishedCategories().filter((c) => !c.free)) {
      expect(xml).toContain(`<loc>https://lily.coach/programs/${c.slug}/</loc>`);
      expect(xml).toContain(`<loc>https://lily.coach/en/programs/${c.slug}/</loc>`);
    }
    expect(xml).not.toContain('/programs/free/');
  });
});
