import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Resposta vai direto para quem preencheu o formulário */
  replyTo?: string | null;
}

export type MailResult = { ok: true } | { ok: false; reason: 'not_configured' | 'failed'; error: string };

/** E-mail com formato válido (o mesmo critério do cadastro de empresa). */
export const isValidEmail = (v: string | null | undefined): v is string => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Há um provedor de e-mail configurado no servidor (SMTP ou Resend) e um remetente? */
export const mailConfigured = () => !!env.mail.from && (!!env.mail.smtp || !!env.mail.resendApiKey);

let transporter: Transporter | null = null;

/** Envia pelo SMTP configurado; sem ele, pelo Resend. Nunca lança: devolve o motivo da falha. */
export async function sendMail(m: MailMessage): Promise<MailResult> {
  const from = env.mail.from;
  if (!from || (!env.mail.smtp && !env.mail.resendApiKey)) {
    return { ok: false, reason: 'not_configured', error: 'Envio de e-mail não configurado no servidor (SMTP_HOST ou RESEND_API_KEY, e MAIL_FROM).' };
  }
  try {
    if (env.mail.smtp) {
      const { host, port, user, pass } = env.mail.smtp;
      transporter ??= nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
      await transporter.sendMail({ from, to: m.to, subject: m.subject, text: m.text, html: m.html, replyTo: m.replyTo ?? undefined });
      return { ok: true };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.mail.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { ok: false, reason: 'failed', error: `Resend respondeu ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'failed', error: (err as Error).message.slice(0, 300) };
  }
}
