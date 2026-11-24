/* ============================================
   LILY COURSES — единый источник правды
   ============================================
   Добавить курс = добавить объект в массив + создать папку
   workouts/<slug>/ (RU) и en/workouts/<slug>/ (EN)
   из TEMPLATE_course.html.

   Поля:
     id, slug         — техн. идентификаторы (slug = имя папки в URL)
     published        — false → карточка покажется как «Скоро»
     title, subtitle  — { ru, en }
     cover            — путь к обложке (3:4 рекомендуется)
     priceRub         — число, ₽ (без копеек)
     priceEur         — число, € (без центов)
     duration         — { ru, en }
     level            — { ru, en }
     includes         — { ru: [], en: [] } — 3 буллета «что входит»
     previewVideoUrl  — ссылка на превью-видео (YouTube/Kinescope embed)
     paymentUrlRub    — ссылка Prodamus, оплата картой РФ / СБП / рассрочка
     paymentUrlIntl   — ссылка Lemon Squeezy / Stripe (зарубежное юрлицо), EUR/USD

   Курс можно купить, только когда published: true и есть хотя бы
   одна ссылка оплаты (https://...). Иначе карточка показывается как «Скоро».

   Ссылку доступа к курсу (инвайт в Telegram-канал, плейлист Kinescope)
   сюда НЕ класть: этот файл открыт всем. Её выдаёт платёжка после
   оплаты, в письме-чеке и на своей странице успешной оплаты.
   ============================================ */

window.LILY_COURSES = [
  {
    id: 'spina',
    slug: 'spina',
    published: true,
    title: {
      ru: 'Спина без боли',
      en: 'Back without pain'
    },
    subtitle: {
      ru: 'Короткие тренировки для здоровой осанки и снятия напряжения',
      en: 'Short workouts for healthy posture and tension release'
    },
    cover: 'assets/images/courses/spina-cover.jpg', // TODO: добавить файл обложки 3:4, ≥1200px по короткой стороне
    priceRub: 2900,
    priceEur: 39,
    duration: { ru: '≈ 3 недели', en: '≈ 3 weeks' },
    level: { ru: 'любой уровень', en: 'all levels' },
    includes: {
      ru: [
        '12 видео-тренировок по 15–25 минут',
        'PDF-гайд по технике и безопасности',
        'Доступ навсегда'
      ],
      en: [
        '12 video workouts, 15–25 min each',
        'PDF guide on technique & safety',
        'Lifetime access'
      ]
    },
    previewVideoUrl: '', // TODO: ссылка на превью-видео (Kinescope / YouTube embed)
    paymentUrlRub: '',   // TODO: ссылка Prodamus — RUB / СБП / рассрочка
    paymentUrlIntl: ''   // TODO: ссылка Lemon Squeezy / Stripe — EUR/USD
  },

  {
    id: 'zaryadka',
    slug: 'zaryadka',
    published: true,
    title: {
      ru: 'Утренняя зарядка',
      en: 'Morning routine'
    },
    subtitle: {
      ru: '10 минут утром, чтобы запустить тело и день',
      en: '10 minutes in the morning to wake up your body'
    },
    cover: 'assets/images/courses/zaryadka-cover.jpg', // TODO: добавить файл обложки
    priceRub: 1900,
    priceEur: 25,
    duration: { ru: '≈ 4 недели', en: '≈ 4 weeks' },
    level: { ru: 'для начинающих', en: 'beginner-friendly' },
    includes: {
      ru: [
        '21 короткая утренняя тренировка',
        'Календарь и подсказки в Telegram',
        'Доступ навсегда'
      ],
      en: [
        '21 short morning workouts',
        'Calendar & Telegram reminders',
        'Lifetime access'
      ]
    },
    previewVideoUrl: '',
    paymentUrlRub: '',
    paymentUrlIntl: ''
  }
];
