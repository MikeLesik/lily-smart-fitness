import type { Localized, LocalizedList, Price } from '../catalog';

/**
 * Тексты продающих страниц /programs/ (RU) и /en/programs/ (EN).
 * RU на «ты», в женском роде, без длинных тире. Всё черновик до согласования с Лилей.
 */

export type Lang = 'ru' | 'en';

export const SITE = 'https://lily.coach';
export const TELEGRAM = 'https://t.me/LilyLesik';

const ru = {
  ogLocale: 'ru_RU',
  ogLocaleAlt: 'en_US',
  prefix: '',
  logoLabel: 'Lily, на главную',
  navLabel: 'Разделы сайта',
  navPrograms: 'Программы',
  navFree: 'Бесплатный урок',
  navLogin: 'Войти',

  workoutForms: ['тренировка', 'тренировки', 'тренировок'],
  programForms: ['программа', 'программы', 'программ'],
  minutes: '{n} мин',
  seconds: '{n} с',
  decimal: ',',
  forever: 'доступ навсегда',
  oneTime: 'разовая оплата',

  buy: 'Купить · {price}',
  buyShort: 'Купить',
  more: 'Подробнее',
  morePrefix: 'Подробнее о программе',
  watchPreview: 'Смотреть превью',
  playPreview: 'Смотреть превью, {d}',
  playChip: 'Смотреть · {d}',

  // Превью
  previewTitle: 'Посмотри начало',
  previewText: '{part} бесплатно, без регистрации.',
  previewFirstMinute: 'Первая минута',
  previewMinuteHalf: 'Первые полторы минуты',
  previewFirstN: 'Первые {n} {unit}',
  secondForms: ['секунда', 'секунды', 'секунд'],
  minuteForms: ['минута', 'минуты', 'минут'],
  previewFrameTitle: 'Превью: {title}',
  previewLoading: 'Загружаем видео…',
  previewUnavailable: 'Превью сейчас недоступно. Попробуй позже.',
  previewNetwork: 'Нет связи. Проверь интернет и нажми ещё раз.',

  // Для кого, что внутри
  forWhomTitle: 'Для кого',
  insideTitle: 'Что внутри',
  freeMark: 'бесплатно',
  lockedLabel: 'Закрыто, откроется после покупки',
  equipment: 'Что понадобится: {list}.',

  // Цена
  buyTitle: 'Одна оплата, доступ навсегда',
  buyFor: 'программа «{title}»',
  buyPoints: [
    'Смотри с телефона, планшета или компьютера',
    'Вход по email и коду из письма, без пароля',
    'Программа откроется сразу после оплаты',
  ],
  promoNote: 'Промокод можно ввести на странице оплаты Stripe.',
  russiaPay: 'Оплатить из России переводом',
  russiaPayNote: 'Перевод в рублях. Доступ Лиля откроет вручную.',
  stickyLabel: 'Покупка программы',
  bundleOffer: 'Или все программы за {price} вместо {sum}',

  // О Лиле
  aboutTitle: 'О Лиле',
  aboutText: 'Лиля Лесик, персональный тренер (Gray Institute USA, FPA) и сертифицированный нутрициолог. 5+ лет практики, 360+ клиенток.',
  aboutLink: 'Подробнее о Лиле',
  aboutAlt: 'Лиля Лесик',

  // FAQ
  faqTitle: 'Частые вопросы',
  faq: [
    {
      q: 'Как я получу доступ?',
      a: 'Сразу после оплаты откроется личный кабинет с программой, а на почту придёт письмо. Входить можно с любого устройства: вводишь email и код из письма, пароль не нужен.',
    },
    {
      q: 'На чём смотреть?',
      a: 'На телефоне, планшете или компьютере, в обычном браузере. Видео остаётся у тебя навсегда, смотри сколько угодно раз.',
    },
    {
      q: 'Я в России. Как оплатить?',
      a: 'Stripe не принимает российские карты. Напиши Лиле в Telegram: она подскажет, как оплатить, и откроет доступ вручную.',
      link: 'telegram-russia',
    },
    {
      q: 'Можно вернуть деньги?',
      a: 'Условия возврата описаны на отдельной странице. Если что-то пошло не так, напиши Лиле в Telegram.',
      link: 'refunds',
    },
    {
      q: 'Где ввести промокод?',
      a: 'На странице оплаты Stripe: нажми «Добавить промокод» и введи код. Скидка применится до оплаты.',
    },
  ] as FaqText[],
  faqRefundsLink: 'Условия возврата',
  faqTelegramLink: 'Написать Лиле в Telegram',

  telegramQuestion: 'Привет, Лиля! У меня вопрос про программу «{title}».',
  telegramRussia: 'Привет, Лиля! Я из России и хочу купить программу «{title}».',
  telegramGeneral: 'Привет, Лиля! У меня вопрос про видеопрограммы.',

  // Каталог /programs/
  indexTitle: 'Видеопрограммы',
  indexDocTitle: 'Видеопрограммы Лили Лесик · Lily',
  indexDescription: 'Видеотренировки Лили Лесик для дома: ягодицы, утренняя зарядка и другие программы. Разовая оплата, доступ навсегда, превью бесплатно.',
  indexLead: 'Тренировки с Лилей дома, в своём темпе. Оплата один раз, доступ навсегда.',
  programsLabel: 'Программы',
  bundleTitle: 'Все программы',
  bundleBoth: 'Обе программы и все новые, которые появятся.',
  bundleMany: 'Все {n} {programs} и новые, которые появятся.',
  bundleInstead: 'вместо {sum}',
  freeTitle: 'Можно начать бесплатно',
  freeText: 'Посмотри бесплатный урок: {subtitle}.',
  freeTextNoSubtitle: 'Посмотри бесплатный урок Лили.',
  freeButton: 'Бесплатный урок',

  programDocTitle: '{title} · видеопрограмма Лили Лесик',
  imageAlt: 'Лиля Лесик в программе «{title}»',

  // Подвал
  footerLegal: 'Документы',
  terms: 'Оферта',
  privacy: 'Конфиденциальность',
  refunds: 'Возврат',
  telegram: 'Telegram',
  switchLang: 'English',
  switchLangCode: 'en',
};

type FaqText = { q: string; a: string; link?: 'refunds' | 'telegram-russia' };
export type Strings = typeof ru;

const en: Strings = {
  ogLocale: 'en_US',
  ogLocaleAlt: 'ru_RU',
  prefix: '/en',
  logoLabel: 'Lily, home',
  navLabel: 'Site sections',
  navPrograms: 'Programs',
  navFree: 'Free lesson',
  navLogin: 'Sign in',

  workoutForms: ['workout', 'workouts', 'workouts'],
  programForms: ['program', 'programs', 'programs'],
  minutes: '{n} min',
  seconds: '{n} s',
  decimal: '.',
  forever: 'lifetime access',
  oneTime: 'one-time payment',

  buy: 'Buy · {price}',
  buyShort: 'Buy',
  more: 'Details',
  morePrefix: 'About the program',
  watchPreview: 'Watch preview',
  playPreview: 'Watch preview, {d}',
  playChip: 'Watch · {d}',

  previewTitle: 'Watch the start',
  previewText: '{part}, free and without signing up.',
  previewFirstMinute: 'The first minute',
  previewMinuteHalf: 'The first 90 seconds',
  previewFirstN: 'The first {n} {unit}',
  secondForms: ['second', 'seconds', 'seconds'],
  minuteForms: ['minute', 'minutes', 'minutes'],
  previewFrameTitle: 'Preview: {title}',
  previewLoading: 'Loading video…',
  previewUnavailable: 'The preview is not available right now. Please try again later.',
  previewNetwork: 'No connection. Check your internet and tap again.',

  forWhomTitle: 'Who it is for',
  insideTitle: 'What is inside',
  freeMark: 'free',
  lockedLabel: 'Locked, opens after purchase',
  equipment: 'What you need: {list}.',

  buyTitle: 'Pay once, keep it forever',
  buyFor: 'the “{title}” program',
  buyPoints: [
    'Watch on your phone, tablet or computer',
    'Sign in with your email and a code, no password',
    'The program opens right after payment',
  ],
  promoNote: 'You can enter a promo code on the Stripe payment page.',
  russiaPay: 'Pay by transfer from Russia',
  russiaPayNote: 'Bank transfer in rubles. Lily will open your access manually.',
  stickyLabel: 'Buy the program',
  bundleOffer: 'Or get all programs for {price} instead of {sum}',

  aboutTitle: 'About Lily',
  aboutText: 'Lily Lesik is a personal trainer (Gray Institute USA, FPA) and a certified nutritionist. 5+ years of practice, 360+ clients.',
  aboutLink: 'More about Lily',
  aboutAlt: 'Lily Lesik',

  faqTitle: 'Questions',
  faq: [
    {
      q: 'How do I get access?',
      a: 'Your account with the program opens right after payment, and you get an email. Sign in from any device with your email and a code from the email. No password needed.',
    },
    {
      q: 'Where can I watch?',
      a: 'On your phone, tablet or computer, in any browser. The videos stay yours for good, watch them as often as you like.',
    },
    {
      q: 'I am in Russia. How can I pay?',
      a: 'Stripe does not accept Russian cards. Message Lily on Telegram: she will tell you how to pay and open access for you manually.',
      link: 'telegram-russia',
    },
    {
      q: 'Can I get a refund?',
      a: 'The refund terms are on a separate page. If something went wrong, message Lily on Telegram.',
      link: 'refunds',
    },
    {
      q: 'Where do I enter a promo code?',
      a: 'On the Stripe payment page: tap “Add promotion code” and enter it. The discount applies before you pay.',
    },
  ],
  faqRefundsLink: 'Refund terms',
  faqTelegramLink: 'Message Lily on Telegram',

  telegramQuestion: 'Hi Lily! I have a question about the “{title}” program.',
  telegramRussia: 'Hi Lily! I am in Russia and want to buy the “{title}” program.',
  telegramGeneral: 'Hi Lily! I have a question about the video programs.',

  indexTitle: 'Video programs',
  indexDocTitle: 'Video programs by Lily Lesik · Lily',
  indexDescription: 'Home workout videos by Lily Lesik: glutes, a morning routine and more. One-time payment, lifetime access, free previews.',
  indexLead: 'Train at home with Lily, at your own pace. Pay once, keep access forever.',
  programsLabel: 'Programs',
  bundleTitle: 'All programs',
  bundleBoth: 'Both programs and every new one that comes out.',
  bundleMany: 'All {n} {programs} and every new one that comes out.',
  bundleInstead: 'instead of {sum}',
  freeTitle: 'Start for free',
  freeText: 'Watch the free lesson: {subtitle}.',
  freeTextNoSubtitle: 'Watch Lily’s free lesson.',
  freeButton: 'Free lesson',

  programDocTitle: '{title} · video program by Lily Lesik',
  imageAlt: 'Lily Lesik in the “{title}” program',

  footerLegal: 'Legal',
  terms: 'Terms',
  privacy: 'Privacy',
  refunds: 'Refunds',
  telegram: 'Telegram',
  switchLang: 'Русский',
  switchLangCode: 'ru',
};

export const STRINGS: Record<Lang, Strings> = { ru, en };

export function fmt(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : ''));
}

export function loc(obj: Localized | undefined | null, lang: Lang): string {
  if (!obj) return '';
  return (lang === 'en' ? obj.en : obj.ru) || obj.ru || '';
}

export function locList(obj: LocalizedList | undefined, lang: Lang): string[] {
  if (!obj) return [];
  const list = lang === 'en' ? obj.en : obj.ru;
  return list && list.length ? list : obj.ru;
}

/** RU: 1 тренировка, 2 тренировки, 5 тренировок. EN: forms[0] для 1, иначе forms[1]. */
export function plural(n: number, forms: string[], lang: Lang): string {
  if (lang === 'en') return n === 1 ? forms[0] : forms[1];
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

/** 1346 → «22 мин», 90 → «1,5 мин» (EN «1.5 min»), 40 → «40 с». Как в кабинете. */
export function duration(sec: number, lang: Lang): string {
  const t = STRINGS[lang];
  if (sec < 60) return fmt(t.seconds, { n: Math.round(sec) });
  const min = sec / 60;
  const frac = min - Math.floor(min);
  if (min < 10 && frac >= 0.25 && frac < 0.75) return fmt(t.minutes, { n: `${Math.floor(min)}${t.decimal}5` });
  return fmt(t.minutes, { n: Math.round(min) });
}

/** €39, €39,90 (EN €39.90), 3900 ₽. Как в кабинете и buy.js. */
export function formatPrice(p: Price | null | undefined, lang: Lang): string {
  if (!p) return '';
  const value = p.amount / 100;
  const num = value % 1 === 0 ? String(value) : value.toFixed(2).replace('.', STRINGS[lang].decimal);
  const sym = ({ eur: '€', usd: '$', rub: '₽' } as Record<string, string>)[p.currency.toLowerCase()];
  if (sym === '₽') return `${num} ₽`;
  return sym ? `${sym}${num}` : `${num} ${p.currency.toUpperCase()}`;
}

/** Цена для schema.org: «39.00». */
export function schemaPrice(p: Price): string {
  return (p.amount / 100).toFixed(2);
}

/** «Первые полторы минуты», «Первая минута», «Первые 40 секунд». */
export function previewPart(sec: number, lang: Lang): string {
  const t = STRINGS[lang];
  if (sec < 55) {
    const n = Math.round(sec);
    return fmt(t.previewFirstN, { n, unit: plural(n, t.secondForms, lang) });
  }
  if (sec <= 65) return t.previewFirstMinute;
  if (sec <= 100) return t.previewMinuteHalf;
  const n = Math.round(sec / 60);
  return fmt(t.previewFirstN, { n, unit: plural(n, t.minuteForms, lang) });
}

export function telegramLink(text: string): string {
  return `${TELEGRAM}?text=${encodeURIComponent(text)}`;
}
