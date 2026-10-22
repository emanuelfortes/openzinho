// Outgoing e-mail for alerts and reports. SMTP comes from the environment so the password
// never sits in the database; without it every send is skipped and reported as such.
import nodemailer, { type Transporter } from 'nodemailer';

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
}

export type SendResult = { sent: true; id: string } | { sent: false; reason: string };

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function smtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number.parseInt(env.SMTP_PORT ?? '587', 10) || 587;
  return {
    host,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE.trim().toLowerCase() === 'true' : port === 465,
    user: env.SMTP_USER?.trim() ?? '',
    pass: env.SMTP_PASS ?? '',
    from,
  };
}

export function emailConfigured(): boolean {
  return smtpConfig() !== null;
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Splits a comma/semicolon/newline separated list and keeps only plain, valid addresses. */
export function parseRecipients(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of (value ?? '').split(/[,;\n]/)) {
    const address = raw.trim().toLowerCase();
    if (EMAIL.test(address)) seen.add(address);
  }
  return [...seen];
}

let cachedTransport: { key: string; transport: Transporter } | null = null;

function transportFor(config: SmtpConfig): Transporter {
  const key = `${config.host}:${config.port}:${config.secure}:${config.user}`;
  if (cachedTransport?.key !== key) {
    cachedTransport = {
      key,
      transport: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
        connectionTimeout: 15_000,
        socketTimeout: 30_000,
      }),
    };
  }
  return cachedTransport.transport;
}

/** Sends one message. Never throws: failures come back as { sent: false, reason }. */
export async function sendEmail(message: EmailMessage, transport?: Transporter, config: SmtpConfig | null = smtpConfig()): Promise<SendResult> {
  const to = message.to.filter((address) => EMAIL.test(address));
  if (to.length === 0) return { sent: false, reason: 'Nenhum destinatário válido.' };
  if (!config && !transport) return { sent: false, reason: 'E-mail não configurado (SMTP_HOST e SMTP_FROM).' };
  try {
    const info = await (transport ?? transportFor(config!)).sendMail({
      from: config?.from ?? 'Nexo <nexo@localhost>',
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { sent: true, id: String(info.messageId ?? '') };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'Falha ao enviar o e-mail.' };
  }
}

/** Minimal HTML escaping for values placed inside e-mail bodies. */
export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
