# LILY: Integrative Fitness & Nutrition (lily.coach)

Сайт Лили Лесик, нутрициолога и интегративного персонального тренера. Продаёт персональное сопровождение (кнопка в Telegram), а дальше видеопрограммы с личным кабинетом.

**Текущая работа идёт по плану `docs/PLAN-CABINET.md`.** Прочитай его перед любой задачей: там цель, решения по умолчанию, архитектура кабинета, этапы и что уже сделано. Один этап = одна сессия и один коммит (или PR) в ветке `cabinet`.

## Ветки и выкладка

- Хостинг: Cloudflare Pages, проект `lily-smart-fitness`, подключён к GitHub-репозиторию MikeLesik/lily-smart-fitness. Каталог сборки `src`, команды сборки нет, функции из `functions/` Pages собирает сам.
- `wrangler.toml` источник правды для привязок (D1) и переменных: верхний уровень = предпросмотр и локальная разработка (база `lily-coach-preview`), `[env.production]` = lily.coach (база `lily-coach`).
- Пуш в `main` сразу выкладывает живой сайт lily.coach. **В `main` ничего не пушить и не сливать без явного OK Михаила.**
- Пуш в любую другую ветку собирает предпросмотр `https://<ветка>.lily-smart-fitness.pages.dev` (например, https://cabinet.lily-smart-fitness.pages.dev). Все проверки идут там.
- Активный аккаунт `gh` на этом Mac не владелец репозитория. Пушить так: `GH_TOKEN=$(gh auth token --user MikeLesik) git push`.
- wrangler стоит в devDependencies: `npx wrangler ...` после `npm install`. Он вошёл в аккаунт Cloudflare Михаила, права на зону только чтение.
- Секреты (`AUTH_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `STREAM_SIGNING_JWK`): `npx wrangler pages secret put <KEY> --project-name lily-smart-fitness --env preview` (или `production`). В Preview заданы все, в Production пока только `RESEND_API_KEY`.
- Миграции D1: `npm run db:migrate:local`, `npm run db:migrate:preview`. Боевую базу мигрировать только на этапе 7.
- Несуществующие адреса отдают `src/404.html` (для `/en/...` отдаётся `src/en/404.html`) с кодом 404. Пока этих файлов не было, Pages отдавал главную с кодом 200.

## Стек

- Фронт: чистые HTML, CSS и ванильный JS. Без фреймворков, без сборки, без npm-зависимостей на фронте.
- Сервер: Cloudflare Pages Functions на TypeScript (`functions/` = маршруты, `server/` = модули), база D1, письма через Resend, защита формы Turnstile, видео в Cloudflare Stream с подписанными ссылками. Без npm-зависимостей в рантайме: только Web API.
- Тесты: vitest + `@cloudflare/vitest-plugin` (D1 в памяти, миграции из `migrations/`). `npm test`, `npm run typecheck`.
- RU в корне `src/`, EN-зеркало в `src/en/`. Тексты живут прямо в HTML.
- Шрифты Google Fonts: Cormorant Garamond (заголовки) и Manrope (текст).
- Анимации на CSS, появление блоков через IntersectionObserver в `main.js`.
- Версии файлов в ссылках (`?v=2`, `main.js?v=4`) служат сбросом кеша: при правке CSS или JS увеличь номер в обеих страницах.

## Структура

```
CLAUDE.md                этот файл
docs/
  PLAN-CABINET.md        план работ по кабинету (главный документ)
  WORKOUTS.md            описание июньского раздела «Видеотренировки» (модель заменяется кабинетом)
  AUDIT.md, REDESIGN-PLAN.md, lily-coach-project-brief.md   старые аудит, план редизайна и бриф
wrangler.toml            Pages: привязки D1 и переменные по средам
package.json             wrangler, vitest, typescript (только для разработки)
.dev.vars.example        локальные секреты; скопировать в .dev.vars
content/catalog.json     категории, видео, цены (источник правды; UID видео в браузер не уходят)
migrations/              схема D1 (0001_auth: users, login_codes, sessions, entitlements, rate_limits; 0002_progress)
functions/api/           маршруты: _middleware.ts (Origin, no-store, JSON 500), auth/*, me.ts, catalog.ts,
                         videos/[id]/playback.ts, progress.ts, [[path]].ts (JSON 404)
server/                  env, http, crypto, db, auth (коды), session (cookie), email (Resend), ratelimit, turnstile,
                         catalog, access (правило доступа), video-provider/ (интерфейс + stream.ts)
tests/                   тесты API (vitest)
src/
  index.html             главная RU
  login/index.html       вход по email и коду (js/login.js, css/cabinet.css), после входа ведёт в /account/
  account/index.html     кабинет: программы, категория, плеер, профиль (js/account.js, hash-маршруты #/c/, #/v/, #/profile)
  404.html               страница 404 RU (абсолютные пути к CSS)
  robots.txt, sitemap.xml   sitemap содержит только / и /en/
  en/index.html, en/404.html
  css/
    variables.css        дизайн-токены (цвета, шрифты, размеры, отступы)
    reset.css, layout.css, hero.css, components.css, animations.css, responsive.css
    workouts.css         каталог курсов, лендинг курса, окно оплаты, success-страницы
  js/
    main.js              меню, липкая кнопка, FAQ, появление блоков, счётчики, таймлайн,
                         каталог курсов, окно оплаты, обёртка аналитики window.track
    courses.js           данные курсов (window.LILY_COURSES), уйдёт на этапе 4
  workouts/, en/workouts/   лендинги курсов, success-страницы и шаблоны (переедут в /programs/ на этапе 5)
  assets/images/         фавиконки, og-image.jpg (1200×630); foto.psd в .gitignore
  assets/videos/hero.mp4
  content/site-content.json   старая выгрузка текстов, страницами не используется
```

## Главная: блоки по порядку

Навигация (логотип, ссылки, EN/RU, «Написать Лиле»; на телефоне бургер и полноэкранное меню) → hero с вертикальным видео → полоса доверия (5+ лет, 360+ клиентов) → `#philosophy` обо мне → `#approach` три столпа → `#results` отзывы → `#workouts` каталог видеотренировок (рендерится из `courses.js`) → `#services` тарифы сопровождения → `#process` как проходит работа → CTA-баннер → `#faq` → футер. На телефоне снизу липкая кнопка Telegram, она появляется после hero и прячется, пока открыто меню.

## Дизайн-система

Токены в `src/css/variables.css`, новые цвета и шрифты не вводить.

| Токен | Значение | Где |
|---|---|---|
| `--cream` | #F5F0EB | фон страницы |
| `--warm-black` | #1A1714 | текст, тёмные секции, hero |
| `--olive` / `--olive-light` | #6B7B5E / #8A9A7A | акцент, надзаголовки |
| `--gold` / `--gold-light` | #C4A265 / #D4B87A | главная кнопка, акценты |
| `--taupe`, `--blush` | #A69585, #E8D5C8 | декоративные |
| `--white` | #FDFCFA | фон карточек |
| `--text-muted` | #7A7067 | основной текст |

- Тон: спокойная редакционная эстетика wellness, не «фитнес-бро». Много воздуха, тонкие золотые линии, зерно на hero.
- Кнопки: `.btn-primary` (золотая заливка), `.btn-ghost` (контур), без скруглений больше 2–3 px.
- Только реальные фото и видео Лили. Без новых декоративных приёмов (сетки точек, «таблетки», сетки иконок, плашки-уведомления).
- Сначала телефон, ширина 360–390. Брейкпоинты: 768 px (планшет), 1024 px (десктоп: ссылки в шапке вместо бургера).

## Тексты и контент

- Новые тексты на «ты», в женском роде, без длинных тире. Всё новое считается черновиком до согласования с Лилей.
- Без Лили не трогать: отзывы (Анна К., Мария Л., Елена Р. похожи на образцы), состав и цены тарифов сопровождения, цитату Лили.
- Кнопки связи ведут в личку Лили `https://t.me/LilyLesik` (с готовым текстом приветствия), `target="_blank" rel="noopener"`.
- Канал: https://t.me/Lily_Smart_Fitness. Instagram: https://www.instagram.com/kpmvl.

## Видео

- Хостинг: Cloudflare Stream. У каждого видео включено Require Signed URLs: без подписанного токена не играет.
- Новое видео: загрузить в дашборде Stream, включить Require Signed URLs, вписать его UID в `providerVideoId` нужного видео в `content/catalog.json`, указать `durationSec`, закоммитить.
- Токен подписываем сами ключом подписи Stream (RS256, 2 часа): `STREAM_SIGNING_KEY_ID` и `STREAM_CUSTOMER_CODE` в `wrangler.toml`, `STREAM_SIGNING_JWK` секретом.
- Доступ решает только сервер (`server/access.ts`): превью всем; бесплатная категория после входа; право на категорию или `all`. Права выдаются вставкой в `entitlements` (этап 6 даст админку).

## Безопасность

- В репозитории ни одного ключа и ни одной ссылки доступа (инвайты в закрытые каналы, ссылки на закрытые видео). Секреты только через `wrangler secret` и переменные проекта Cloudflare. `.dev.vars` в `.gitignore`.
- Ссылки оплаты принимаются только `https://`.

## Локальный запуск

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Сайт и API на http://localhost:8788/. Письма локально не уходят: код входа печатается в лог wrangler. Только статика без API: `cd src && python3 -m http.server 8000`.

Перед пушем проверь на 375 px: меню (открытие, `aria-expanded`, Esc, переход к разделам), липкую кнопку, отсутствие горизонтальной прокрутки и ошибок в консоли.
