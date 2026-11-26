/** Короткие слова (в, и, на, a, of) не остаются в конце строки: неразрывный пробел после них. */
export function nbsp(text: string): string {
  return text.replace(/(?<=^|[\s(«“"])([A-Za-zА-Яа-яЁё]{1,2}) (?=\S)/g, '$1\u00a0');
}

/** Экранирование для HTML-текста и значений атрибутов (в кавычках), с неразрывными пробелами. */
export function esc(value: unknown): string {
  return nbsp(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON для <script type="application/ld+json">: без «</script>» и разрывов строк JS внутри. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** .jpg → .webp рядом (обложки лежат парами). Версия в адресе (?v=2) переходит и на webp. */
export function webpOf(src: string): string | null {
  const re = /\.jpe?g(\?[^#]*)?$/i;
  return re.test(src) ? src.replace(re, '.webp$1') : null;
}

export interface PictureOptions {
  src: string;
  alt: string;
  width: number;
  height: number;
  className: string;
  pictureClass?: string;
  eager?: boolean;
  sizes?: string;
}

/** <picture> с webp и jpg; размеры заданы, чтобы не прыгала вёрстка. */
export function picture(o: PictureOptions): string {
  const webp = webpOf(o.src);
  const loading = o.eager ? 'eager' : 'lazy';
  const priority = o.eager ? ' fetchpriority="high"' : '';
  return (
    `<picture${o.pictureClass ? ` class="${esc(o.pictureClass)}"` : ''}>` +
    (webp ? `<source type="image/webp" srcset="${esc(webp)}">` : '') +
    `<img class="${esc(o.className)}" src="${esc(o.src)}" alt="${esc(o.alt)}" width="${o.width}" height="${o.height}" loading="${loading}" decoding="async"${priority}>` +
    `</picture>`
  );
}

export const ICON_LOCK =
  '<svg class="prg-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true" focusable="false"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>';

export const ICON_PLAY =
  '<svg class="prg-icon" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M5 3.2v9.6L12.6 8z"/></svg>';
