// Тесты идут на фикстуре с видео (tests/fixtures/catalog.json), а не на content/catalog.json:
// проверки доступа к видео и оплаты не зависят от того, что сейчас лежит в настоящем каталоге.
import fixture from './fixtures/catalog.json';
import { setCatalogForTests, type Catalog } from '../server/catalog';

setCatalogForTests(fixture as unknown as Catalog);
