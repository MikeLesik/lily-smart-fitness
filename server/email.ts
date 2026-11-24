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
};

export async function sendLoginCode(env: Env, email: string, code: string): Promise<void> {
  const t = LOGIN_CODE.ru;
  const text = `${t.intro}\n\n${code}\n\n${t.ttl}\n\n${t.help} ${TELEGRAM_URL}\n`;
  const html = `<!doctype html><html lang="ru"><body style="margin:0;padding:0;background:#F5F0EB;">
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
