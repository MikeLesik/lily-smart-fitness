import type { Env } from '../../server/env';
import { json } from '../../server/http';
import { publicCatalog } from '../../server/catalog';

/** Публичный каталог: категории, видео (без UID в хостинге), цены, наборы. */
export const onRequestGet: PagesFunction<Env> = async () => json(publicCatalog());
