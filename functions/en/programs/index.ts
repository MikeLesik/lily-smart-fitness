import { programsIndex } from '../../../server/pages/handlers';

/** /en/programs/: catalog of paid programs (server-rendered from content/catalog.json). */
export const onRequest = programsIndex('en');
