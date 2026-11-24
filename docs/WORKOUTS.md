# Видеотренировки — что готово и что заполнить вручную

MVP-секция «Видеотренировки» на lily.coach. Каталог на главной +
лендинги отдельных курсов + success-страницы. Оплата — внешние
ссылки двух провайдеров (Prodamus для РФ + Lemon Squeezy / Stripe
для зарубежных карт). Выдача доступа — через закрытый
Telegram-канал курса (рекомендуется) или плейлист Kinescope.

---

## 1. Где что лежит

```
src/
├── index.html                              ← секция #workouts + пункт меню (RU)
├── en/index.html                           ← то же по-английски
├── css/workouts.css                        ← все стили каталога/лендинга/success
├── js/
│   ├── courses.js                          ← данные курсов (источник правды)
│   └── main.js                             ← + рендер каталога, success, pay-modal, track()
├── workouts/
│   ├── TEMPLATE_course.html                ← шаблон лендинга курса (RU)
│   ├── TEMPLATE_success.html               ← шаблон success-страницы (RU)
│   ├── spina/index.html  · spina/success/index.html
│   └── zaryadka/index.html · zaryadka/success/index.html
├── en/workouts/
│   ├── TEMPLATE_course.html  · TEMPLATE_success.html
│   ├── spina/    · spina/success/
│   └── zaryadka/ · zaryadka/success/
└── assets/images/courses/                  ← сюда положить обложки (TODO)
```

---

## 2. Архитектурные решения — кратко

1. **Каталог на главной — JS-рендер из `courses.js`.** Добавили
   объект → карточка появилась. Сборки нет — это нужно, чтобы
   каждый курс имел отдельную статическую страницу для корректного
   OG-превью при расшаривании ссылки.
2. **Лендинги курсов — статические HTML-страницы** в `workouts/<slug>/`.
   Свои `<title>`, `description`, OG image на каждый курс.
3. **Две платёжки, два контура.** Кнопка «Купить» открывает модалку
   с выбором: «Карта РФ / СБП / рассрочка» → Prodamus, «Зарубежная
   карта» → Lemon Squeezy / Stripe. Это решение продуктовое; **сайту
   нужны только ссылки** из `courses.js`.
4. **Доступ без логина (capability-based).** Сайт всем показывает
   одинаковую витрину. После оплаты покупатель попадает на
   success-страницу со ссылкой-инвайтом в закрытый Telegram-канал
   курса (или плеер Kinescope) + дубль ссылки приходит письмом от
   платёжки. Записи «кто что купил» живут в дашборде платёжки.
5. **Размещение в воронке:** секция перед `#services` — доступный
   продукт-вход перед премиум-коучингом.

---

## 3. Что заполнить руками перед запуском

Все плейсхолдеры помечены `TODO` или ссылками `#TODO-...`. Поиск
по проекту: `grep -RIn "TODO" src/`.

### 3.1. Обложки курсов
```
src/assets/images/courses/spina-cover.jpg
src/assets/images/courses/zaryadka-cover.jpg
```
Соотношение сторон **3:4**, ≥1200 px по короткой стороне (для
качественного OG-превью в Telegram/Instagram).

### 3.2. Платёжки — две на курс

Открыть `src/js/courses.js` и подставить в каждом курсе:

| Поле              | Что положить                                              |
|-------------------|-----------------------------------------------------------|
| `paymentUrlRub`   | Ссылка Prodamus (RUB / СБП / рассрочка), самозанятость РФ |
| `paymentUrlIntl`  | Ссылка Lemon Squeezy или Stripe (EUR/USD), зарубежное юрлицо |
| `previewVideoUrl` | Embed-URL превью на Kinescope/YouTube (опционально)       |
| `accessType`      | `"telegram"` (рекомендуется) или `"kinescope"`            |
| `accessUrl`       | Инвайт в закрытый Telegram-канал курса **или** ссылка на плейлист Kinescope |

> **Важно:** ссылки **только в `courses.js`** — лендинги
> используют их через `data-pay-rub` / `data-pay-intl`, success
> рендерит из `accessUrl` по `accessType`.
>
> В demo-лендингах (`workouts/<slug>/index.html`) сейчас стоят
> плейсхолдеры `#TODO-prodamus-rub-<slug>` и `#TODO-prodamus-intl-<slug>`
> в атрибутах `data-pay-*`. Их нужно либо заменить руками на
> реальные URL, либо удалить эти атрибуты и положить ссылки только
> в `courses.js` — тогда модалка возьмёт их там (TODO для этапа 2).

### 3.3. Success-redirect в платёжках

В кабинете **Prodamus** для каждой платёжной ссылки указать
поле `urlSuccess`:
- `https://lily.coach/workouts/<slug>/success/` (для RU-покупателя)
- `https://lily.coach/en/workouts/<slug>/success/` (для EN)

В кабинете **Lemon Squeezy / Stripe** прописать аналогичный
`success_url` или Redirect URL в настройках продукта.

### 3.4. Доступ к контенту — два варианта

**Вариант A (рекомендуется): закрытый Telegram-канал на курс.**
1. Создай канал «Спина без боли — Lily», тип — частный, «по заявкам».
2. Подключи бота-модератора (например,
   [@JoinReqBot](https://t.me/JoinReqBot) или
   [@MissRose_bot](https://t.me/MissRose_bot) — авто-одобрение
   заявок по списку email/имени). На MVP можно одобрять руками.
3. На этапе 2 — Cloudflare Worker слушает webhook от Prodamus/Stripe,
   получает email покупателя, сам отправляет одноразовый
   invite-link через Bot API. Пока — ручное одобрение.
4. Сгенерируй invite-link и положи его в `accessUrl` курса.

**Вариант B: плейлист Kinescope с защитой.**
1. Залей видео в Kinescope, сделай плейлист.
2. Включи защиту по домену + watermark (email — на этапе 2).
3. Ссылка на плейлист → в `accessUrl`. В `accessType` поставь `"kinescope"`.

### 3.5. Дубль доступа письмом

В **Prodamus** настроить тело письма-чека: добавить в шаблон
ссылку из `accessUrl` (или статический текст «Доступ к курсу:
<URL>»). В **Lemon Squeezy / Stripe** — настроить кастомный
e-mail у продукта или auto-fulfillment с ссылкой.

### 3.6. Оферта и Политика обработки ПД

В лендингах есть блок согласия (checkbox + ссылки на оферту и
ПД). Подставить реальные ссылки в:
- `src/workouts/<slug>/index.html` → `#TODO-terms`, `#TODO-privacy`
- то же в EN-зеркалах.

> На MVP чекбокс — UI-плейсхолдер: согласие фиксирует платёжка
> при оплате. На этапе 2 можно сделать блокировку кнопки до клика
> по чекбоксу, если нужна юридическая страховка.

### 3.7. Цены и описание блоков

В лендингах остались плейсхолдеры `TODO:` в блоках:
- «Для кого / Что получишь»
- «Программа по блокам» (4 модуля)
- «Отзывы» (2 карточки)
- 1 ответ FAQ

Заменить на реальные тексты в обеих локалях.

---

## 4. Как добавить новый курс

1. Открой `src/js/courses.js`, добавь новый объект в массив
   `window.LILY_COURSES` (структура — в комментарии шапки файла).
   Карточка на главной появится автоматически.
2. Создай папку `src/workouts/<slug>/`, скопируй туда
   `src/workouts/TEMPLATE_course.html` как `index.html`.
3. Замени маркеры `{{COURSE_*}}` (список в шапке шаблона).
4. Создай `src/workouts/<slug>/success/index.html` из
   `TEMPLATE_success.html` — там нужно поменять только
   `data-success-slug="<slug>"` (остальное JS подставит из `courses.js`).
5. Повтори шаги 2–4 для EN в `src/en/workouts/<slug>/`.
6. Положи обложку в `src/assets/images/courses/<slug>-cover.jpg`.
7. Заведи две платёжные ссылки (Prodamus + Lemon Squeezy/Stripe),
   пропиши `urlSuccess` / `success_url` на success-страницы.

---

## 5. Аналитика

В `main.js` есть обёртка `window.track(event, payload)`. Сейчас
она пишет в `window.dataLayer` (если есть) и в `console.debug`.

Когда поставите Яндекс.Метрику или GA4 — переопределите её
внутри `main.js`, заменив `console.debug` на:
```js
ym(ID, 'reachGoal', event, payload);
// или
gtag('event', event, payload);
```

Делегированный обработчик подхватывает любой элемент с атрибутом
`data-analytics="..."` — добавлять руками ничего не нужно. Сейчас
отслеживается:

| Событие                   | Где                                     |
|---------------------------|-----------------------------------------|
| `course_card_click`       | клик «Подробнее» на карточке курса      |
| `course_hero_buy_click`   | «Купить» в hero лендинга                |
| `course_final_buy_click`  | «Купить» в финальном CTA                |
| `course_sticky_buy_click` | мобильная sticky-CTA «Купить»           |
| `course_preview_view`     | контейнер превью-видео                  |
| `pay_modal_open`          | открытие модалки выбора контура         |
| `pay_option_select`       | клик «Карта РФ» / «Зарубежная карта»    |
| `course_access_click`     | переход в Telegram/плеер с success      |

---

## 6. Поведение оплаты

```
Кнопка [data-pay-trigger] (любая «Купить»)
    └─ Модалка #pay-modal
         ├─ «Карта РФ / СБП»     → paymentUrlRub  (Prodamus, новая вкладка)
         └─ «Зарубежная карта»   → paymentUrlIntl (Lemon Squeezy/Stripe)
              └─ оплата на стороне провайдера
                   └─ redirect на /workouts/<slug>/success/
                        └─ JS читает accessType + accessUrl и
                           показывает «Перейти в Telegram-канал»
                           или «Открыть плеер Kinescope»
                   + письмо от провайдера с дублем ссылки доступа
```

Если в `data-pay-rub` или `data-pay-intl` пусто — кнопка в модалке
становится `aria-disabled`, не ломает UI.

---

## 7. Запуск локально

```
cd src && python3 -m http.server 3000
```
- http://localhost:3000/                          — главная RU
- http://localhost:3000/en/                       — главная EN
- http://localhost:3000/workouts/spina/           — лендинг курса
- http://localhost:3000/workouts/spina/success/   — success (с пустым
  `accessUrl` покажет «ссылка настраивается»)

---

## 8. Этап 2 (вне scope MVP)

- **Cloudflare Worker + webhook платёжки → Bot API.** Worker
  принимает webhook покупки, по email находит покупателя и
  кидает в Telegram-канал курса одноразовый invite (с TTL).
  Лечит проблему «инвайт-ссылка утекла в чат-копилку».
- **Magic-link на e-mail** для отдельного личного кабинета:
  тот же Worker генерит JWT-токен и отдаёт по ссылке.
- **Свой плеер видео** (Cloudflare Stream / Mux / Kinescope с
  watermark + домен-binding). Это нужно, когда курсы дороже €100
  и пиратство станет ощутимо.
- **Каталог с фильтрами, бандлы, подписка** на всю библиотеку
  — когда курсов будет 5+.
- **Корзина / эквайринг на сайте** — только если будут пакеты
  «курс + 1 консультация».
