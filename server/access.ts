import type { CatalogCategory, CatalogVideo } from './catalog';
import type { Entitlement, User } from './db';

/** Есть ли у пользователя доступ ко всей категории (без учёта превью). */
export function hasCategoryAccess(category: CatalogCategory, user: User | null, entitlements: Entitlement[]): boolean {
  if (!user) return false;
  if (category.free) return true;
  return entitlements.some((e) => e.scope === category.slug || e.scope === 'all');
}

/**
 * Правило из плана (4.2): видео доступно, если это превью, или категория бесплатная и пользователь вошёл,
 * или есть активное право на категорию, или активное право «all».
 * entitlements должны быть уже отфильтрованы по активности (getActiveEntitlements).
 */
export function canWatch(
  video: CatalogVideo,
  category: CatalogCategory,
  user: User | null,
  entitlements: Entitlement[],
): boolean {
  return video.preview || hasCategoryAccess(category, user, entitlements);
}
