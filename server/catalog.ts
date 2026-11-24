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

export interface LocalizedList {
  ru: string[];
  en?: string[];
}

export interface CatalogFaqItem {
  q: Localized;
  a: Localized;
}

export interface CatalogCategory {
  slug: string;
  title: Localized;
  subtitle?: Localized;
  /** Обложка 4:5 из кадра видео, путь от корня сайта (/assets/images/programs/<slug>.jpg). */
  cover?: string;
  free: boolean;
  published: boolean;
  price: Price | null;
  /** Продающая страница /programs/<slug>/: meta description и описание товара (до ~160 символов). */
  description?: Localized;
  /** Кадр 9:16 для превью-плеера (/assets/images/programs/<slug>-preview.jpg), иначе обложка. */
  previewPoster?: string;
  /** «Что понадобится», строчными: «гантели и устойчивая ступенька». */
  equipment?: Localized;
  /** «Для кого»: 3–4 коротких пункта. */
  forWhom?: LocalizedList;
  /** Вопросы этой программы, идут перед общими. */
  faq?: CatalogFaqItem[];
  videos: CatalogVideo[];
}

export interface CatalogBundle {
  slug: string;
  title: Localized;
  cover?: string;
  categories: '*' | string[];
  price: Price;
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

/** Платные опубликованные категории с ценой: то, что продают страницы /programs/. */
export function paidCategories(): CatalogCategory[] {
  return publishedCategories().filter((c) => !c.free && c.price !== null);
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
      cover: c.cover ?? null,
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
    bundles: catalog.bundles.map((b) => ({
      slug: b.slug,
      title: b.title,
      cover: b.cover ?? null,
      categories: b.categories,
      price: b.price,
    })),
  };
}

/** То, что можно купить: опубликованная платная категория или набор. */
export interface Sellable {
  scope: string;
  kind: 'category' | 'bundle';
  title: Localized;
  price: Price;
}

export function findSellable(scope: string): Sellable | null {
  const category = publishedCategories().find((c) => c.slug === scope);
  if (category) {
    return !category.free && category.price ? { scope, kind: 'category', title: category.title, price: category.price } : null;
  }
  const bundle = catalog.bundles.find((b) => b.slug === scope);
  return bundle ? { scope, kind: 'bundle', title: bundle.title, price: bundle.price } : null;
}
