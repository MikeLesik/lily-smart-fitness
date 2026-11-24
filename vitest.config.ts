import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        // wrangler.toml здесь не читаем: он для Pages, тестам хватает привязок ниже.
        config: false,
        miniflare: {
          compatibilityDate: '2026-11-01',
          d1Databases: ['DB'],
          bindings: {
            TEST_MIGRATIONS: migrations,
            AUTH_SECRET: 'test-secret',
            APP_ENV: 'test',
            EMAIL_FROM: 'Lily <hello@lily.coach>',
            STRIPE_SECRET_KEY: 'rk_test_dummy',
            STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
            ADMIN_EMAILS: 'boss@example.com, Lily.Admin@Example.com',
          },
        },
      }),
    ],
    test: {
      include: ['tests/**/*.test.ts'],
      setupFiles: ['./tests/apply-migrations.ts'],
    },
  };
});
