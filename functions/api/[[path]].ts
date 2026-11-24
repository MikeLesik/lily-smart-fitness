import { json } from '../../server/http';

/** Неизвестный /api/* адрес: JSON 404 вместо HTML-страницы. */
export const onRequest: PagesFunction = async () => json({ error: 'not_found' }, 404);
