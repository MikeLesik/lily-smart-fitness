import { programPage } from '../../../server/pages/handlers';

/** /en/programs/<slug>/: program sales page (server-rendered from content/catalog.json). */
export const onRequest = programPage('en');
