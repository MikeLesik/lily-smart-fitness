import { programsIndex } from '../../server/pages/handlers';

/** /programs/: каталог платных программ (HTML с сервера из content/catalog.json). */
export const onRequest = programsIndex('ru');
