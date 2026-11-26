# LILY: Integrative Fitness & Nutrition (lily.coach)

Сайт Лили Лесик, нутрициолога и интегративного персонального тренера. Продаёт персональное сопровождение (кнопка в Telegram), а дальше видеопрограммы с личным кабинетом.

**Текущая работа идёт по плану `docs/PLAN-CABINET.md`.** Прочитай его перед любой задачей: там цель, решения по умолчанию, архитектура кабинета, этапы и что уже сделано. Один этап = одна сессия и один коммит (или PR) в ветке `cabinet`.

## Ветки и выкладка

- Хостинг: Cloudflare Pages, проект `lily-smart-fitness`, подключён к GitHub-репозиторию MikeLesik/lily-smart-fitness. Каталог сборки `src`, команды сборки нет, функции из `functions/` Pages собирает сам.
- `wrangler.toml` источник правды для привязок (D1) и переменных: верхний уровень = предпросмотр и локальная разработка (база `lily-coach-preview`), `[env.production]` = lily.coach (база `lily-coach`).
- Пуш в `main` сразу выкладывает живой сайт lily.coach. **В `main` ничего не пушить и не сливать без явного OK Михаила.** Исключение (решение Михаила 25.11.2026): текстовые правки Лили, которые Михаил присылает в чат (скрин и новый текст), вносить в RU и EN и сразу выкладывать на lily.coach, без вопроса. Всё остальное (структура, код, цены, оплата, удаление блоков) по-прежнему только после OK.
- Пуш в любую другую ветку собирает предпросмотр `https://<ветка>.lily-smart-fitness.pages.dev` (например, https://cabinet.lily-smart-fitness.pages.dev). Все проверки идут там.
- Активный аккаунт `gh` на этом Mac не владелец репозитория. Пушить так: `GH_TOKEN=$(gh auth token --user MikeLesik) git push`.
- wrangler стоит в devDependencies: `npx wrangler ...` после `npm install`. Он вошёл в аккаунт Cloudflare Михаила, права на зону только чтение.
- Секреты (`AUTH_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `STREAM_SIGNING_JWK`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_EMAILS`): `npx wrangler pages secret put <KEY> --project-name lily-smart-fitness --env preview` (или `production`). Заданы все в обеих средах. Секрет Pages вступает в силу только со следующей выкладкой. Production Stripe боевой с 26.11.2026: вебхук restoreLab на https://lily.coach/api/stripe/webhook (секрет в `STRIPE_WEBHOOK_SECRET`) и ограниченный ключ `lily-coach-live` в `STRIPE_SECRET_KEY` (создаёт и записывает сам Михаил, в чат ключ не присылать). Предпросмотр и локальная разработка остаются на песочнице: тестовые оплаты только там.
- Миграции D1: `npm run db:migrate:local`, `npm run db:migrate:preview`; боевая база: `npx wrangler d1 migrations apply lily-coach --env production --remote` (0001–0003 применены 24.11, 0004 применена 25.11).
- Несуществующие адреса отдают `src/404.html` (для `/en/...` отдаётся `src/en/404.html`) с кодом 404. Пока этих файлов не было, Pages отдавал главную с кодом 200.

## Стек

- Фронт: чистые HTML, CSS и ванильный JS. Без фреймворков, без сборки, без npm-зависимостей на фронте.
- Сервер: Cloudflare Pages Functions на TypeScript (`functions/` = маршруты, `server/` = модули), база D1, письма через Resend, защита формы Turnstile, видео в Cloudflare Stream с подписанными ссылками, оплата через Stripe Checkout (без SDK, fetch к REST API). Без npm-зависимостей в рантайме: только Web API.
- Тесты: vitest + `@cloudflare/vitest-plugin` (D1 в памяти, миграции из `migrations/`). `npm test`, `npm run typecheck`.
- RU в корне `src/`, EN-зеркало в `src/en/`. Тексты живут прямо в HTML.
- Шрифт один на всём сайте: Cormorant Garamond из Google Fonts (400, 500, 600, 700, курсив 400 и 500; 300 у крупных заголовков). Решение владельца от 25.11.2026, Manrope больше не подключается (письма в `server/email.ts` набраны системным шрифтом).
- Анимации на CSS, появление блоков через IntersectionObserver в `main.js`.
- Версии файлов в ссылках (`?v=2`, `main.js?v=4`) служат сбросом кеша: при правке CSS или JS увеличь номер в обеих страницах. То же с картинками: Pages отдаёт их с кешем браузера на 4 часа, поэтому при замене фото под прежним именем добавь или увеличь `?v=` в адресе (фото «Обо мне» сейчас `?v=2`: главная RU и EN, страница программы).

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
migrations/              схема D1 (0001_auth: users, login_codes, sessions, entitlements, rate_limits; 0002_progress; 0003_orders: orders, stripe_events; 0004_playback_holders)
functions/api/           маршруты: _middleware.ts (Origin, no-store, JSON 500), auth/*, me.ts, catalog.ts, leads.ts,
                         videos/[id]/playback.ts, videos/[id]/heartbeat.ts, progress.ts, checkout/index.ts, checkout/complete.ts,
                         stripe/webhook.ts, [[path]].ts (JSON 404)
functions/programs/, functions/en/programs/   /programs/ и /programs/<slug>/: HTML с сервера из catalog.json
functions/sitemap.xml.ts sitemap из каталога
functions/api/admin/     users, grant, revoke, export (CSV): только для ADMIN_EMAILS
functions/api/events.ts  события браузера → PostHog (без cookie и без скрипта PostHog)
server/                  env, http, crypto, db, auth (коды), session (cookie), email (Resend), ratelimit, turnstile,
                         catalog, access (правило доступа), video-provider/ (интерфейс + stream.ts),
                         playback-lock (одно устройство на аккаунт),
                         stripe (API, цены, подпись вебхука), orders (заказы, права, возвраты),
                         login-flow (общий путь «прислать код» для входа и лида),
                         pages/ (шаблоны страниц программ: layout, program, programs-index, i18n, html),
                         admin (проверка админа, CSV), analytics (capture в PostHog), purchase (письмо + событие покупки)
tests/                   тесты API (vitest)
src/
  index.html             главная RU: оффер программ → обо мне → #programs → как это работает → отзывы →
                         бесплатный урок → #services (сопровождение) → FAQ → футер с юр. ссылками
  login/index.html       вход по email и коду (js/login.js, css/cabinet.css), после входа ведёт в /account/
  account/index.html     кабинет: программы, категория, плеер, профиль, свой чек (js/account.js, hash-маршруты #/c/, #/v/, #/profile, #/receipt/<id>)
  checkout/success/, checkout/cancel/   возврат из Stripe: оплата ещё обрабатывается / не завершена
  free/                  бесплатный урок за email (js/lead.js → /api/leads → код → кабинет)
  links/                 страница для шапки Instagram: 4 кнопки, передаёт utm_* дальше
  recipes/               бесплатный раздел рецептов: пока заглушка «скоро» (noindex, в sitemap нет); ссылки из подвала главной и из кабинета
  legal/terms/           оферта, редакция 25.11 (ждёт согласования юриста; продавец без адреса и NIF по решению Михаила; EN пока заглушка)
  legal/privacy/         политика обработки персональных данных, редакция 25.11 (ждёт согласования юриста; EN пока заглушка)
  admin/                 админка: пользователи, выдача и отзыв доступа, CSV лидов и покупателей (js/admin.js, css/admin.css)
  en/...                 EN-зеркала всех страниц, включая login, account, checkout, free, links, legal
  404.html               страница 404 RU (абсолютные пути к CSS)
  robots.txt             sitemap.xml отдаёт функция (из каталога)
  en/index.html, en/404.html
  css/
    variables.css        дизайн-токены (цвета, шрифты, размеры, отступы)
    reset.css, layout.css, hero.css, components.css, animations.css, responsive.css
    workouts.css         витрина видеотренировок на главной (карточки из /api/catalog)
    buy.css              окно покупки (email → Stripe)
    pages.css            /free/, /links/, /legal/
    programs.css         страницы программ
  js/
    main.js              меню, липкая кнопка, FAQ, появление блоков, счётчики, таймлайн,
                         витрина видеотренировок из /api/catalog, обёртка аналитики window.track
    buy.js               покупка: любой [data-buy="<scope>"] открывает оплату (вошедшая сразу в Stripe, гость вводит email);
                         UTM первого касания в localStorage.lily_utm; «Войти» [data-nav-login] → «Кабинет»
    lead.js, program.js  форма бесплатного урока; превью-плеер на странице программы
    analytics.js         на всех страницах: window.track(event, props) → /api/events; UTM первого касания
    login.js, account.js тексты в словаре I18N ru/en, язык по <html lang>
  assets/images/         фавиконки, og-image.jpg (1200×630); foto.psd в .gitignore
                         иконки сайта с 26.11.2026: тёмный знак на кремовом квадрате (apple-touch-icon 180, favicon-192, favicon-32/16 со скруглением),
                         в ссылках ?v=2 для сброса кеша; favicon.png (знак на прозрачном фоне) остаётся логотипом в шапке
  assets/images/programs/  обложки программ 4:5 (<slug>.jpg и .webp, 480×600) и обложки тренировок 9:16 (<slug>/NN.jpg 1080×1920 и NN-480.jpg)
  assets/videos/hero.mp4
  content/site-content.json   старая выгрузка текстов, страницами не используется
```

## Главная: блоки по порядку (с 24.11, шаг 2 плана `docs/PLAN-MARKETING.md`)

Шапка 60 px (логотип, «Войти», EN/RU, бургер; на десктопе ссылки и «Написать Лиле») → первый экран: заголовок с результатом, цена «от €59» (`data-min-price` из каталога), «Выбрать программу», «Бесплатный урок», вертикальное видео → `#for-you` «Тебе сюда, если» (4 ситуации) → `#programs` (карточки из `/api/catalog`: сейчас одна, «Послеродовое восстановление» €59, 7 тренировок, доступ 30 дней, с кнопкой «Купить»; лента на телефоне; ссылка «Все программы» скрыта, пока программа одна; под карточкой строка про оплату и вход) → `#about` «Обо мне» с цифрами (цитата снята 26.11.2026 по решению Михаила) → `#results` отзывы (секция скрыта атрибутом `hidden` до настоящих отзывов) → `#free` бесплатный урок → `#services` сопровождение (тарифы лентой, Telegram) → `#faq` (9 вопросов) → футер. Липкая кнопка на телефоне: «Программы от €59» и Telegram. Старые «Сильные ягодицы», «Утренняя зарядка» и набор «Все программы» сняты (`published: false`), их страницы отдают 404. Страница программы: под «Купить» кнопка «Оплатить из России переводом» (Telegram), блок «О Лиле», липкая полоса покупки до 768 px. Светлые страницы (программы, /free/, /legal/) используют общую шапку `.cab-header`: LILY, Программы, Войти.

Правило Михаила: один смысловой блок = один экран (≤660 px при 390, ≤640 при 360). Проверять `getBoundingClientRect().height` секций.

## Дизайн-система

Токены в `src/css/variables.css`, новые цвета и шрифты не вводить.

- Шрифт: только Cormorant Garamond (решение владельца 25.11.2026). `--font-display` и `--font-body` указывают на него; второй шрифт не подключать.
- У Cormorant низкие строчные, поэтому мелкие размеры крупнее, чем были под гротеск: `--text-xs` 17–18 px, `--text-sm` 19–20 px, `--text-base` 21–22 px, основной текст весом 500, межстрочный 1,3–1,45. Заголовки (`--text-lg` и выше) прежних размеров.
- Прописные (надзаголовки, меню, кнопки): `--text-caps` 14–15 px и `--text-btn` 14 px, вес 600–700, разрядка 0,12–0,16em.
- Цифры ровные: на `body` стоит `font-variant-numeric: lining-nums`; где нужен `tabular-nums`, писать `lining-nums tabular-nums`.

| Токен | Значение | Где |
|---|---|---|
| `--cream` | #F5F0EB | фон страницы |
| `--warm-black` | #1A1714 | текст, тёмные секции, hero |
| `--olive` / `--olive-light` | #6B7B5E / #8A9A7A | акцент, надзаголовки |
| `--gold` / `--gold-light` | #C4A265 / #D4B87A | главная кнопка, акценты |
| `--taupe`, `--blush` | #A69585, #E8D5C8 | декоративные |
| `--white` | #FDFCFA | фон карточек |
| `--text-muted` | #746A61 | основной текст (до 24.11 было #7A7067; 4.66:1 на cream) |

- Тон: спокойная редакционная эстетика wellness, не «фитнес-бро». Много воздуха, тонкие золотые линии, зерно на hero.
- Кнопки: `.btn-primary` (золотая заливка), `.btn-ghost` (контур), без скруглений больше 2–3 px.
- Фото, обложки и видео скруглены на 8 px (`--radius-md`, решение Михаила 26.11.2026): фото в «Обо мне», бесплатном уроке, /free/ и /links/, карточка программы на главной, обложки и плеер на странице программы, обложки, миниатюры и плеер в кабинете, видео первого экрана на десктопе. Кнопки, поля, карточки с текстом и окна остаются 2 px.
- Только реальные фото и видео Лили. Без новых декоративных приёмов (сетки точек, «таблетки», сетки иконок, плашки-уведомления).
- Сначала телефон, ширина 360–390. Брейкпоинты: 768 px (планшет), 1024 px (десктоп: ссылки в шапке вместо бургера).

## Тексты и контент

- Новые тексты на «ты», в женском роде, без длинных тире. Всё новое считается черновиком до согласования с Лилей.
- Без Лили не трогать: отзывы (Анна К., Мария Л., Елена Р. похожи на образцы), состав и цены тарифов сопровождения.
- О возвратах на сайте не пишем (решение Михаила 24.11): нет ни страницы, ни вопроса в FAQ, ни ссылок, ни гарантий возврата. Обработка возврата в Stripe остаётся: полный возврат закрывает доступ, в кабинете такой заказ не показывается, в админке у него статус «отменён». Адреса `/legal/refunds/` отдают 404 через функции `functions/legal/refunds/` и `functions/en/legal/refunds/`.
- Кнопки связи ведут в личку Лили `https://t.me/LilyLesik` (с готовым текстом приветствия), `target="_blank" rel="noopener"`.
- Канал: https://t.me/Lily_Smart_Fitness. Instagram: https://www.instagram.com/kpmvl.

## Видео

- Хостинг: Cloudflare Stream. У каждого видео включено Require Signed URLs: без подписанного токена не играет.
- Новое видео: загрузить в дашборде Stream, включить Require Signed URLs, вписать его UID в `providerVideoId` нужного видео в `content/catalog.json`, указать `durationSec`, закоммитить.
- Наполнить программу (например, `postpartum`, 7 тренировок): для каждого видео `postpartum-01…07` вписать `providerVideoId`, `durationSec` (секунды), при желании `title` и `description` (ru/en) и `equipment` (ru/en, строчными: «коврик и полотенце»; пустое = строки «Что понадобится» нет). Видео без `providerVideoId` или `durationSec` не готово: в `/api/catalog` `ready: false`, playback 404. Программа «Скоро», пока не готово хотя бы одно основное видео; когда готовы все, продажа открывается сама.
- Обложка и превью тренировки: у видео поле `cover` (9:16, `/assets/images/programs/<slug>/01.jpg`, рядом уменьшенная `01-480.jpg`), у превью поле `previewOf` (id основного видео). Обложка идёт постером в плеер (параметр `poster` в адресе iframe Stream, работает только по https) и миниатюрой в список кабинета; на странице программы «Что внутри» становится лентой обложек с кнопкой превью у каждой. Превью открыто всем, без входа.
- Программа `postpartum` наполнена 26.11.2026: 7 тренировок и 7 превью по 30 секунд в Cloudflare Stream (имена `lily postpartum-NN` и `lily postpartum-NN-preview`), исходники в папке Михаила «Единый стиль». Названия и «что понадобится» взяты с обложек, описания и английские тексты черновые.
- `accessDays` у категории: срок доступа в днях (`postpartum`: 30). Право получает `entitlements.expires_at = выдача + accessDays` (вебхук, `/api/checkout/complete`, админка). Истёкшее право не даёт смотреть и не мешает купить снова; в кабинете «Доступ до …», после срока «Доступ закончился …» и «Купить снова». Без поля доступ бессрочный. Набор продаётся, только если он не `published: false` и опубликованы минимум две платные программы.
- Водяной знак: на платном видео (не превью, не бесплатный урок) кабинет кладёт поверх плеера email зрителя (прозрачность 0.4, переезжает раз в 15–25 с). У такого iframe нет `allowfullscreen`; своя кнопка «На весь экран» разворачивает контейнер со знаком (Fullscreen API; на iPhone кнопки нет).
- Одно устройство: платное видео аккаунт смотрит на одном устройстве одновременно (устройство = сессия входа). Выдача ссылки на платное видео записывает сессию в `playback_holders` (последний открывший смотрит). Кабинет раз в 30 с зовёт `POST /api/videos/<id>/heartbeat`; ответ `active: false` убирает плеер и показывает «Смотреть здесь». Уже выданную ссылку Stream сервер не отзывает, это ограничение для обычной зрительницы.
- Защита от записи экрана: решение Михаила 25.11.2026 остаться на Cloudflare Stream без DRM (водяной знак, срок доступа, одно устройство). Kinescope с DRM отложен, детали в `docs/PLAN-POSTPARTUM.md`.
- Токен подписываем сами ключом подписи Stream (RS256, 2 часа): `STREAM_SIGNING_KEY_ID` и `STREAM_CUSTOMER_CODE` в `wrangler.toml`, `STREAM_SIGNING_JWK` секретом.
- Доступ решает только сервер (`server/access.ts`): превью всем; бесплатная категория после входа; право на категорию или `all`. Права выдаются вставкой в `entitlements` (этап 6 даст админку).
- «Скоро» (правило в `server/catalog.ts`, флагов в JSON нет): категория без основных видео (превью не в счёт) показывается с ценой, но без «Купить» и превью, checkout отвечает 409 `coming_soon`; набор `all` скоро, если видео нет ни в одной платной категории; бесплатный урок без видео: на /free/ вместо формы ссылка на канал, `/api/leads` 409. Чтобы вернуть продажу, достаточно вписать готовые видео в каталог. Тесты идут на фикстуре `tests/fixtures/catalog.json` (в ней `postpartum` с готовыми видео и сроком 30 дней).

## Оплата (Stripe)

- Аккаунт Stripe общий с Restore Lab. Всё наше помечено `metadata.brand = "lily"`; вебхук остальное пропускает с ответом 200.
- Цена живёт только в `content/catalog.json`. При первой оплате сервер сам заводит в Stripe товар `lily_<scope>` и цену с `lookup_key = lily_<scope>_<amount>_<currency>`; новая цена в каталоге = новая цена в Stripe. Руками в Stripe ничего не заводить.
- Только евро (решение Михаила 26.11.2026): сессия оплаты создаётся с `adaptive_pricing.enabled = false`, страница Stripe не предлагает платить в валюте покупательницы. Настройку Adaptive Pricing общего аккаунта не трогаем, она нужна Restore Lab.
- Права выдаются только из вебхука, из `/api/checkout/complete` после проверки сессии в Stripe или вручную. Полный возврат закрывает доступ, частичный нет.
- Чек: свой, в кабинете (`#/receipt/<id>`, кнопка печати и сохранения в PDF), рисуется из `/api/me` (id заказа, номер из первых 8 знаков id, название программы, сумма, дата). Это подтверждение оплаты, не налоговый документ. Ссылку на чек Stripe покупательнице не показываем: там реквизиты общего аккаунта Restore Lab; `receipt_url` остаётся в базе и в CSV админки.
- Боевой ключ: ограниченный (restricted), права: Checkout Sessions, Products и Prices на запись, PaymentIntents и Charges на чтение. На выписке покупательницы платёж виден как `RESTORELAB* LILY COACH` (префикс общего аккаунта).
- Тестовый режим (предпросмотр и локально): песочница restoreLab, ключ `lily-coach-preview` (ограниченный). Вебхук предпросмотра: `https://cabinet.lily-smart-fitness.pages.dev/api/stripe/webhook`.
- Локально: в одном терминале `npm run dev`, в другом `stripe listen --forward-to http://localhost:8788/api/stripe/webhook --events checkout.session.completed,checkout.session.async_payment_succeeded,charge.refunded`; секрет из `stripe listen --print-secret` в `.dev.vars`. Тестовая карта 4242 4242 4242 4242.

## Аналитика и админка

- PostHog, регион EU. Ключ проекта `POSTHOG_KEY` (публичный) и `POSTHOG_HOST` в `wrangler.toml`; без ключа события молча не отправляются.
- Браузер шлёт события на `/api/events` (sendBeacon). Гость = `anon_` + хеш IP и браузера с солью дня (на устройстве ничего не хранится, баннер cookie не нужен); вошедшая = id пользователя. `page_view` уходит как `$pageview`. События из плана 5.5: page_view, lead_submit, login_code_sent, login_success, preview_play, checkout_start, video_start, video_complete; `purchase` отправляет сервер при первой выдаче доступа по оплате (`server/purchase.ts`). Email в PostHog не уходит.
- UTM первого касания: `localStorage.lily_utm` (analytics.js, buy.js, lead.js) → лид (`users.utm_*`), заказ (`orders.utm`), метаданные Stripe; покупателю без UTM записываются UTM покупки.
- Админка `/admin/`: вход обычным кодом, доступ только для email из секрета `ADMIN_EMAILS` (через запятую). Выдать доступ по email (создаёт пользователя), отозвать любое право, CSV покупателей (с UTM из Stripe) и лидов бесплатного урока.

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
