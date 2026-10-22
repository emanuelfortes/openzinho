import { describe, expect, it } from 'vitest';
import nodemailer from 'nodemailer';
import { parseRecipients, sendEmail, smtpConfig } from './send';

describe('smtpConfig', () => {
  it('stays off without host and sender', () => {
    expect(smtpConfig({})).toBeNull();
    expect(smtpConfig({ SMTP_HOST: 'smtp.exemplo.com' })).toBeNull();
  });

  it('reads the environment and defaults to TLS on port 465', () => {
    expect(smtpConfig({ SMTP_HOST: 'smtp.exemplo.com', SMTP_FROM: 'Nexo <a@b.com>', SMTP_PORT: '465' })).toMatchObject({ port: 465, secure: true });
    expect(smtpConfig({ SMTP_HOST: 'smtp.exemplo.com', SMTP_FROM: 'a@b.com' })).toMatchObject({ port: 587, secure: false });
  });
});

describe('parseRecipients', () => {
  it('keeps valid, unique addresses', () => {
    expect(parseRecipients('Ana@Exemplo.com; bob@exemplo.com.br\nnão é email, ana@exemplo.com')).toEqual(['ana@exemplo.com', 'bob@exemplo.com.br']);
  });

  it('drops header injection attempts', () => {
    expect(parseRecipients('a@b.com\r\nBcc: x@y.com')).toEqual(['a@b.com']);
  });
});

describe('sendEmail', () => {
  it('reports a missing configuration instead of throwing', async () => {
    expect(await sendEmail({ to: ['a@b.com'], subject: 'x', text: 'x' }, undefined, null)).toEqual({ sent: false, reason: expect.stringContaining('não configurado') });
  });

  it('sends through the given transport', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true });
    const result = await sendEmail({ to: ['a@b.com'], subject: 'Alerta', text: 'Olá' }, transport, null);
    expect(result.sent).toBe(true);
  });
});
