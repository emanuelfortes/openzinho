// The daily alert e-mail for new reviews with 1 to 3 stars. Pure: builds the message only.
import { excerpt } from './monitor';

export interface AlertEmailItem {
  projectName: string;
  listingTitle: string;
  listingUrl: string | null;
  rating: number | null;
  author: string;
  publishedAt: number | null;
  text: string;
  url: string | null;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function stars(rating: number | null): string {
  if (rating === null) return 'sem nota';
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return `${'★'.repeat(full)}${'☆'.repeat(5 - full)} (${rating.toLocaleString('pt-BR')})`;
}

function date(ts: number | null, timeZone: string): string {
  return ts === null ? 'data desconhecida' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone }).format(ts);
}

const safeUrl = (url: string | null) => (url && /^https:\/\//i.test(url) ? url : null);

export function buildAlertEmail(items: AlertEmailItem[], options: { dashboardUrl?: string | null; timeZone?: string } = {}): { subject: string; text: string; html: string } {
  const timeZone = options.timeZone ?? 'America/Sao_Paulo';
  const count = items.length;
  const subject = count === 1
    ? `Nova avaliação de até 3 estrelas: ${items[0].listingTitle}`
    : `${count} novas avaliações de até 3 estrelas`;

  const text = [
    count === 1 ? 'Uma avaliação nova com nota de 1 a 3 estrelas apareceu nos perfis monitorados.' : `${count} avaliações novas com nota de 1 a 3 estrelas apareceram nos perfis monitorados.`,
    '',
    ...items.flatMap((item) => [
      `${item.projectName} · ${item.listingTitle}`,
      `${stars(item.rating)} · ${item.author} · ${date(item.publishedAt, timeZone)}`,
      item.text ? `"${excerpt(item.text)}"` : '(sem texto)',
      `Link: ${safeUrl(item.url) ?? safeUrl(item.listingUrl) ?? 'indisponível'}`,
      '',
    ]),
    options.dashboardUrl ? `Ver no Nexo: ${options.dashboardUrl}` : '',
    'Responda com calma e sempre revise o texto antes de publicar.',
  ].join('\n');

  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#030508">
<p>${escapeHtml(text.split('\n')[0])}</p>
${items.map((item) => {
    const link = safeUrl(item.url) ?? safeUrl(item.listingUrl);
    return `<div style="border-left:3px solid #1f6bff;padding:6px 12px;margin:12px 0">
<p style="margin:0;font-weight:bold">${escapeHtml(item.projectName)} · ${escapeHtml(item.listingTitle)}</p>
<p style="margin:4px 0;color:#444">${escapeHtml(stars(item.rating))} · ${escapeHtml(item.author)} · ${escapeHtml(date(item.publishedAt, timeZone))}</p>
<p style="margin:4px 0">${item.text ? `“${escapeHtml(excerpt(item.text))}”` : '<em>(sem texto)</em>'}</p>
${link ? `<p style="margin:4px 0"><a href="${escapeHtml(link)}">Abrir no Google</a></p>` : ''}
</div>`;
  }).join('\n')}
${options.dashboardUrl ? `<p><a href="${escapeHtml(options.dashboardUrl)}">Ver no Nexo</a></p>` : ''}
<p style="color:#666">Responda com calma e sempre revise o texto antes de publicar.</p>
</div>`;

  return { subject, text, html };
}
