import raw from '../content/catalog.json';

export interface Localized {
  ru: string;
  en?: string;
}

export interface Price {
  amount: number;
  currency: string;
}

export interface CatalogVideo {
  id: string;
  title: Localized;
  description?: Localized;
  durationSec: number;
  preview: boolean;
  provider: string;
  providerVideoId: string;
}

export interface CatalogCategory {
  slug: string;
  title: Localized;
  subtitle?: Localized;
  free: boolean;
  published: boolean;
  price: Price | null;
  stripePriceId: string | null;
  videos: CatalogVideo[];
}

export interface CatalogBundle {
  slug: string;
  title: Localized;
  categories: '*' | string[];
  price: Price;
  stripePriceId: string | null;
}

export interface Catalog {
  categories: CatalogCategory[];
  bundles: CatalogBundle[];
}

/** Источник правды: content/catalog.json (в бандл функций, не в публичные файлы). */
export const catalog = raw as unknown as Catalog;

export function publishedCategories(): CatalogCategory[] {
  return catalog.categories.filter((c) => c.published);
}

export function findVideo(id: string): { video: CatalogVideo; category: CatalogCategory } | null {
  for (const category of publishedCategories()) {
    const video = category.videos.find((v) => v.id === id);
    if (video) return { video, category };
  }
  return null;
}

/** Каталог для браузера: без provider и providerVideoId. */
export function publicCatalog() {
  return {
    categories: publishedCategories().map((c) => ({
      slug: c.slug,
      title: c.title,
      subtitle: c.subtitle ?? null,
      free: c.free,
      price: c.price,
      videos: c.videos.map((v) => ({
        id: v.id,
        title: v.title,
        description: v.description ?? null,
        durationSec: v.durationSec,
        preview: v.preview,
      })),
    })),
    bundles: catalog.bundles.map((b) => ({ slug: b.slug, title: b.title, categories: b.categories, price: b.price })),
  };
}
