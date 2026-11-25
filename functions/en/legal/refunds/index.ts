import { notFoundPage, type PagesEnv } from '../../../../server/pages/handlers';

/**
 * Страницы «Возврат» на сайте больше нет. Отдаём 404 явно: без функции Pages
 * до недели достаёт удалённую страницу из кеша прошлых выкладок.
 */
export const onRequest: PagesFunction<PagesEnv> = ({ request, env }) => notFoundPage(request, env, 'en');
