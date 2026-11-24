import { programPage } from '../../server/pages/handlers';

/** /programs/<slug>/: продающая страница программы (HTML с сервера из content/catalog.json). */
export const onRequest = programPage('ru');
