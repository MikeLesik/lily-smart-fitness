import type { Env } from './env';

const TELEGRAM_URL = 'https://t.me/LilyLesik';

export class EmailError extends Error {}

interface Message {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Отправка через Resend. Без RESEND_API_KEY письмо не уходит:
 * локально и в тестах текст пишется в консоль, в остальных средах это ошибка.
 * Reply-To не ставим: входящей почты на lily.coach нет, связь через Telegram.
 */
async function send(env: Env, msg: Message): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.APP_ENV === 'local' || env.APP_ENV === 'test') {
      console.log(`[email] to ${msg.to}: ${msg.subject}\n${msg.text}`);
      return;
    }
    throw new EmailError('RESEND_API_KEY is not set');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM ?? 'Lily <hello@lily.coach>',
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    console.error('[email] resend failed', res.status, (await res.text()).slice(0, 300));
    throw new EmailError(`resend ${res.status}`);
  }
}

// Тексты писем: черновик до согласования с Лилей.
const LOGIN_CODE = {
  ru: {
    subject: (code: string) => `Код для входа: ${code}`,
    intro: 'Твой код для входа в личный кабинет lily.coach:',
    ttl: 'Код действует 10 минут. Если ты не запрашивала вход, просто проигнорируй это письмо.',
    help: 'Вопросы можно задать Лиле в Telegram:',
  },
  en: {
    subject: (code: string) => `Your sign-in code: ${code}`,
    intro: 'Your code to sign in to your lily.coach account:',
    ttl: 'The code is valid for 10 minutes. If you did not ask to sign in, just ignore this email.',
    help: 'Questions? Message Lily on Telegram:',
  },
};

export async function sendLoginCode(env: Env, email: string, code: string, locale: 'ru' | 'en' = 'ru'): Promise<void> {
  const t = LOGIN_CODE[locale];
  const text = `${t.intro}\n\n${code}\n\n${t.ttl}\n\n${t.help} ${TELEGRAM_URL}\n`;
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:0;background:#F5F0EB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1A1714;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FDFCFA;border:1px solid rgba(26,23,20,0.08);padding:32px 28px;">
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.15em;">LILY</td></tr>
<tr><td style="padding-top:24px;font-size:15px;line-height:1.6;color:#746A61;">${t.intro}</td></tr>
<tr><td style="padding:16px 0 20px;font-family:Arial,Helvetica,sans-serif;font-size:36px;font-weight:bold;letter-spacing:0.25em;color:#1A1714;">${code}</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#746A61;">${t.ttl}</td></tr>
<tr><td style="padding-top:20px;font-size:14px;line-height:1.6;color:#746A61;">${t.help} <a href="${TELEGRAM_URL}" style="color:#6B7B5E;">@LilyLesik</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  await send(env, { to: email, subject: t.subject(code), text, html });
}

const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Дата из секунд Unix (UTC): «25 декабря 2026», EN «25 December 2026». Без Intl, чтобы не зависеть от данных локалей. */
export function formatDate(sec: number, locale: 'ru' | 'en'): string {
  const d = new Date(sec * 1000);
  const month = (locale === 'en' ? MONTHS_EN : MONTHS_RU)[d.getUTCMonth()];
  return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

// Письмо о покупке: черновик до согласования с Лилей.
// expiresAt: срок доступа программы (секунды Unix), null = бессрочно, строки про срок нет.
export async function sendPurchaseEmail(
  env: Env,
  email: string,
  programTitle: string,
  origin: string,
  locale: 'ru' | 'en' = 'ru',
  expiresAt: number | null = null,
): Promise<void> {
  const prefix = locale === 'en' ? '/en' : '';
  const loginUrl = `${origin}${prefix}/login/?next=${encodeURIComponent(`${prefix}/account/`)}`;
  const subject = locale === 'en' ? `Access is open: “${programTitle}”` : `Доступ открыт: «${programTitle}»`;
  const lines =
    locale === 'en'
      ? {
          thanks: 'Thank you for your purchase!',
          ready: `“${programTitle}” is waiting for you in your account.`,
          button: 'Open my account',
          until: expiresAt ? `Access is open until ${formatDate(expiresAt, 'en')}.` : '',
          how: `You can sign in from any device: open ${origin}/en/login/, enter this email (${email}) and we will send you a code. No password needed.`,
          receipt: 'Your payment receipt is always in your account, under “Profile”.',
          help: 'Questions? Message Lily on Telegram:',
        }
      : {
          thanks: 'Спасибо за покупку!',
          ready: `Программа «${programTitle}» уже ждёт тебя в личном кабинете.`,
          button: 'Открыть кабинет',
          until: expiresAt ? `Доступ открыт до ${formatDate(expiresAt, 'ru')}.` : '',
          how: `Входить можно с любого устройства: открой ${origin}/login/, введи этот email (${email}), и мы пришлём код. Пароль не нужен.`,
          receipt: 'Чек об оплате всегда есть в кабинете, в разделе «Профиль».',
          help: 'Вопросы можно задать Лиле в Telegram:',
        };
  const text = `${lines.thanks}\n\n${lines.ready}${lines.until ? ` ${lines.until}` : ''}\n\n${lines.button}: ${loginUrl}\n\n${lines.how}\n\n${lines.receipt}\n\n${lines.help} ${TELEGRAM_URL}\n`;
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:0;background:#F5F0EB;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0EB;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#1A1714;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FDFCFA;border:1px solid rgba(26,23,20,0.08);padding:32px 28px;">
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:0.15em;">LILY</td></tr>
<tr><td style="padding-top:24px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1A1714;">${lines.thanks}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.6;color:#746A61;">${lines.ready}</td></tr>
${lines.until ? `<tr><td style="padding-top:8px;font-size:15px;line-height:1.6;color:#1A1714;">${lines.until}</td></tr>` : ''}
<tr><td style="padding:24px 0;"><a href="${loginUrl}" style="display:inline-block;background:#C4A265;color:#1A1714;text-decoration:none;font-size:12px;font-weight:bold;letter-spacing:0.2em;text-transform:uppercase;padding:14px 24px;border-radius:2px;">${lines.button}</a></td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#746A61;">${lines.how}</td></tr>
<tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#746A61;">${lines.receipt}</td></tr>
<tr><td style="padding-top:20px;font-size:14px;line-height:1.6;color:#746A61;">${lines.help} <a href="${TELEGRAM_URL}" style="color:#6B7B5E;">@LilyLesik</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
  await send(env, { to: email, subject, text, html });
}
