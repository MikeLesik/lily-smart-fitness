import { publishedCategories } from '../server/catalog';

const SITE = 'https://lily.coach';

/** sitemap.xml из каталога: главная, программы и бесплатный урок, RU и EN с hreflang. */
export const onRequestGet: PagesFunction = async () => {
  const pairs: Array<[string, string]> = [
    ['/', '/en/'],
    ['/programs/', '/en/programs/'],
    ...publishedCategories()
      .filter((c) => !c.free)
      .map((c): [string, string] => [`/programs/${c.slug}/`, `/en/programs/${c.slug}/`]),
    ['/free/', '/en/free/'],
  ];
  const urls = pairs
    .flatMap(([ru, en]) =>
      [ru, en].map(
        (loc) => `  <url>
    <loc>${SITE}${loc}</loc>
    <xhtml:link rel="alternate" hreflang="ru" href="${SITE}${ru}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}${ru}"/>
  </url>`,
      ),
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
