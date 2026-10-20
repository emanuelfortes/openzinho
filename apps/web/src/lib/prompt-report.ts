import type { PromptCheck, TrackedPrompt } from '@/lib/db';
import { PLATFORM_LABELS } from '@/lib/llm-options';
import type { PdfCalendar, PdfStatus, StatusItem } from '@/lib/report-pdf-blocks';

// Pure report building for Prompt Tracker: status dots, the calendar grid and the markdown/PDF
// content. Used by the page (PDF sections, dots) and by the markdown export route.

export type CheckStatus = 'cited' | 'not-cited' | 'error';

export const STATUS_LABEL: Record<CheckStatus, string> = { cited: 'Citado', 'not-cited': 'Não citado', error: 'Erro' };
export const STATUS_EMOJI: Record<CheckStatus | 'none', string> = { cited: '🟢', 'not-cited': '⚪', error: '🔴', none: '⬜' };

export function checkStatus(check: Pick<PromptCheck, 'error' | 'mentioned'>): CheckStatus {
  if (check.error) return 'error';
  return check.mentioned ? 'cited' : 'not-cited';
}

export function formatRate(total: number, mentioned: number): string {
  if (total === 0) return '—';
  return `${mentioned} / ${total} (${Math.round((mentioned / total) * 100)}%)`;
}

export function formatCost(cost: number | null): string {
  return cost === null ? '—' : `US$ ${cost.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function excerpt(answer: string | null, max = 140): string {
  if (!answer) return '';
  const oneLine = answer.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Latest check of each UTC day, keyed by YYYY-MM-DD (the `date` column). */
function latestPerDay(checks: PromptCheck[]): Map<string, PromptCheck> {
  const byDay = new Map<string, PromptCheck>();
  for (const check of checks) {
    const current = byDay.get(check.date);
    if (!current || check.checkedAt > current.checkedAt) byDay.set(check.date, check);
  }
  return byDay;
}

const DAY_MS = 86_400_000;

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday of the week containing the given UTC date. */
function mondayOf(date: Date): Date {
  const offset = (date.getUTCDay() + 6) % 7;
  return new Date(date.getTime() - offset * DAY_MS);
}

export interface CalendarDay { date: string; status: CheckStatus | null; inRange: boolean }
export interface CalendarWeek { monday: string; days: CalendarDay[] }

/**
 * Weeks (Monday to Sunday) covering every check. Each day carries the status of its latest check,
 * or null when it is inside the range but was not checked. Days outside the range are inRange: false.
 */
export function calendarWeeks(checks: PromptCheck[]): CalendarWeek[] {
  if (checks.length === 0) return [];
  const byDay = latestPerDay(checks);
  const days = [...byDay.keys()].sort();
  const first = utcDate(days[0]);
  const last = utcDate(days[days.length - 1]);

  const weeks: CalendarWeek[] = [];
  for (let monday = mondayOf(first); monday.getTime() <= last.getTime(); monday = new Date(monday.getTime() + 7 * DAY_MS)) {
    const week: CalendarWeek = { monday: isoDay(monday), days: [] };
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(monday.getTime() + i * DAY_MS);
      const key = isoDay(day);
      const inRange = day.getTime() >= first.getTime() && day.getTime() <= last.getTime();
      const check = inRange ? byDay.get(key) : undefined;
      week.days.push({ date: key, status: check ? checkStatus(check) : null, inRange });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Weekly calendar grid in markdown: one row per week, one cell per day. */
export function calendarMarkdown(checks: PromptCheck[]): string {
  if (checks.length === 0) return '_Nenhuma verificação ainda._';
  const header = '| Semana | Seg | Ter | Qua | Qui | Sex | Sáb | Dom |';
  const divider = '|---|---|---|---|---|---|---|---|';
  const rows = calendarWeeks(checks).map((week) => {
    const cells = [week.monday, ...week.days.map((d) => {
      if (!d.inRange) return '';
      const emoji = d.status ? STATUS_EMOJI[d.status] : STATUS_EMOJI.none;
      return `${emoji} ${Number(d.date.slice(8))}`;
    })];
    return `| ${cells.join(' | ')} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/** Dot strip of the most recent checks, oldest first. */
export function recentStrip(checks: PromptCheck[], count = 14): string {
  const recent = [...checks].sort((a, b) => a.checkedAt - b.checkedAt).slice(-count);
  return recent.map((c) => STATUS_EMOJI[checkStatus(c)]).join('');
}

export function legendMarkdown(): string {
  return `${STATUS_EMOJI.cited} citado · ${STATUS_EMOJI['not-cited']} não citado · ${STATUS_EMOJI.error} erro · ${STATUS_EMOJI.none} sem verificação`;
}

export interface PromptReportInput {
  prompt: TrackedPrompt;
  checks: PromptCheck[];
  total: number;
  mentioned: number;
  generatedAt: number;
}

function generatedLine(ts: number): string {
  return `_Gerado em ${new Date(ts).toISOString().replace('T', ' ').slice(0, 16)} UTC_`;
}

/** Markdown report for one prompt: settings, calendar of mentions and check history. */
export function promptMarkdown(input: PromptReportInput): string {
  const { prompt, checks, total, mentioned, generatedAt } = input;
  const target = [prompt.brand && `marca "${prompt.brand}"`, prompt.domain && `domínio ${prompt.domain}`].filter(Boolean).join(' e ');
  const history = [...checks].sort((a, b) => b.checkedAt - a.checkedAt);

  const lines = [
    `# Relatório do prompt`,
    '',
    `> ${prompt.prompt}`,
    '',
    `- **Plataforma:** ${PLATFORM_LABELS[prompt.platform] ?? prompt.platform} · ${prompt.model}${prompt.webSearch ? ' · busca na web ativada' : ''}${prompt.countryCode ? ` · ${prompt.countryCode}` : ''}`,
    `- **Procurando:** ${target || '—'}`,
    `- **Taxa de menção:** ${formatRate(total, mentioned)}`,
    `- **Verificações:** ${total} com sucesso${checks.length > total ? `, ${checks.length - total} com falha` : ''}`,
    '',
    generatedLine(generatedAt),
    '',
    '## Calendário',
    '',
    legendMarkdown(),
    '',
    calendarMarkdown(checks),
    '',
    '## Histórico',
    '',
    '| Data | Status | Menções à marca | Domínio citado | Custo | Resposta |',
    '|---|---|---|---|---|---|',
    ...history.map((c) => {
      const status = `${STATUS_EMOJI[checkStatus(c)]} ${c.error ? 'Erro' : c.mentioned ? 'Citado' : 'Não citado'}`;
      return `| ${cell(c.date)} | ${cell(status)} | ${c.error ? '—' : c.brandMentions} | ${c.error ? '—' : c.domainCited ? 'sim' : 'não'} | ${formatCost(c.cost)} | ${cell(c.error ?? excerpt(c.answer))} |`;
    }),
    '',
  ];
  return lines.join('\n');
}

export interface OverviewItem {
  prompt: TrackedPrompt;
  checks: PromptCheck[];
  total: number;
  mentioned: number;
  latest: PromptCheck | undefined;
}

/** Markdown overview of every tracked prompt: latest status, rate and a dot strip of recent checks. */
export function overviewMarkdown(items: OverviewItem[], generatedAt: number): string {
  const lines = [
    '# Visão geral do Monitor de prompts',
    '',
    `${items.length} ${items.length === 1 ? 'prompt monitorado' : 'prompts monitorados'} · ${generatedLine(generatedAt).slice(1, -1)}`,
    '',
    legendMarkdown(),
    '',
    '| Prompt | Modelo | Procurando | Último | Taxa de menção | Verificações recentes |',
    '|---|---|---|---|---|---|',
    ...items.map(({ prompt, checks, total, mentioned, latest }) => {
      const target = [prompt.brand, prompt.domain].filter(Boolean).join(' · ');
      const latestLabel = latest ? `${STATUS_EMOJI[checkStatus(latest)]} ${latest.error ? 'Erro' : latest.mentioned ? 'Citado' : 'Não citado'}` : `${STATUS_EMOJI.none} Não verificado`;
      return `| ${cell(prompt.prompt)} | ${cell(`${PLATFORM_LABELS[prompt.platform] ?? prompt.platform} ${prompt.model}`)} | ${cell(target)} | ${cell(latestLabel)} | ${cell(formatRate(total, mentioned))} | ${recentStrip(checks) || '—'} |`;
    }),
    '',
  ];
  return lines.join('\n');
}

// ---- PDF content (plain ASCII text: the jsPDF standard fonts cannot draw emoji) ----

export interface PdfMetric { label: string; value: string; detail?: string; status?: PdfStatus }
export interface PdfSection { title: string; rows: Array<[string, string]>; statusItems?: StatusItem[]; calendar?: PdfCalendar }

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "2026-10-08" -> "8 out 2026", or "Qui 8 out 2026" with the weekday. Pure UTC, no locale. */
export function formatDay(date: string, withWeekday = false): string {
  const d = utcDate(date);
  const label = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withWeekday ? `${WEEKDAY_NAMES[d.getUTCDay()]} ${label}` : label;
}

function pdfStatus(check: PromptCheck | undefined): PdfStatus {
  return check ? checkStatus(check) : 'none';
}

function pdfBadge(check: PromptCheck | undefined): string {
  if (!check) return 'Não verificado';
  if (check.error) return 'Erro';
  return check.mentioned ? 'Citado' : 'Não citado';
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function modelLabel(prompt: TrackedPrompt): string {
  return `${PLATFORM_LABELS[prompt.platform] ?? prompt.platform} ${prompt.model}`;
}

function targetText(prompt: TrackedPrompt): string {
  return [prompt.brand, prompt.domain].filter(Boolean).join(' / ');
}

/** One-line result of a check, shown under its date in the history. */
function checkDetail(check: PromptCheck): string {
  if (check.error) return check.error;
  const mentions = check.brandMentions > 0 ? plural(check.brandMentions, 'menção à marca', 'menções à marca') : 'nenhuma menção à marca';
  return `${mentions} - domínio ${check.domainCited ? 'citado' : 'não citado'}`;
}

/** Weekly heat-map rows, Monday first, one coloured day per check (the latest of each day). */
function pdfCalendar(checks: PromptCheck[]): PdfCalendar {
  return {
    weeks: calendarWeeks(checks).map((week) => ({
      label: `Semana de ${formatDay(week.monday).replace(/ \d{4}$/, '')}`,
      days: week.days.map((d) => (d.inRange ? { day: Number(d.date.slice(8)), status: d.status } : null)),
    })),
  };
}

/** PDF for one prompt: latest result, mention calendar and a card per check, newest first. */
export function promptPdf(input: PromptReportInput): { metrics: PdfMetric[]; sections: PdfSection[] } {
  const { prompt, checks, total, mentioned } = input;
  const history = [...checks].sort((a, b) => b.checkedAt - a.checkedAt);
  const latest = history[0];
  const settings: Array<[string, string]> = [
    ['Procurando', targetText(prompt) || '-'],
    ['Busca na web', prompt.webSearch ? 'Ativada' : 'Desativada'],
  ];
  if (prompt.countryCode) settings.push(['País', prompt.countryCode]);

  const sections: PdfSection[] = [{ title: 'Configurações', rows: settings }];
  if (checks.length > 0) {
    sections.push({ title: 'Calendário', rows: [], calendar: pdfCalendar(checks) });
    sections.push({
      title: 'Histórico de verificações',
      rows: [],
      statusItems: history.map((c): StatusItem => ({
        status: pdfStatus(c),
        title: formatDay(c.date, true),
        subtitle: checkDetail(c),
        badge: pdfBadge(c),
      })),
    });
  }

  return {
    metrics: [
      { label: 'Último resultado', value: pdfBadge(latest), detail: latest ? formatDay(latest.date) : 'Nenhuma verificação ainda', status: pdfStatus(latest) },
      { label: 'Taxa de menção', value: total ? `${Math.round((mentioned / total) * 100)}%` : '-', detail: `${mentioned} de ${plural(total, 'verificação', 'verificações')}` },
      { label: 'Verificações', value: String(total), detail: checks.length > total ? `${checks.length - total} com falha` : 'Nenhuma falhou' },
      { label: 'Modelo', value: PLATFORM_LABELS[prompt.platform] ?? prompt.platform, detail: prompt.model },
    ],
    sections,
  };
}

/** PDF overview: only the latest result of each prompt, with a visual cited / not cited marker. */
export function overviewPdf(items: OverviewItem[]): { metrics: PdfMetric[]; sections: PdfSection[] } {
  const cited = items.filter((i) => i.latest && !i.latest.error && i.latest.mentioned).length;
  const notCited = items.filter((i) => i.latest && !i.latest.error && !i.latest.mentioned).length;
  const other = items.length - cited - notCited;
  return {
    metrics: [
      { label: 'Prompts monitorados', value: String(items.length) },
      { label: 'Citado', value: `${cited} / ${items.length}`, detail: 'na última verificação', status: 'cited' },
      { label: 'Não citado', value: `${notCited} / ${items.length}`, detail: other > 0 ? `${other} com erro ou sem verificação` : 'na última verificação', status: 'not-cited' },
    ],
    sections: [
      {
        title: 'Últimos resultados',
        rows: [],
        statusItems: items.map(({ prompt, latest }): StatusItem => ({
          status: pdfStatus(latest),
          title: prompt.prompt,
          subtitle: [modelLabel(prompt), targetText(prompt) && `Procurando ${targetText(prompt)}`].filter(Boolean).join(' - '),
          badge: pdfBadge(latest),
          note: latest ? formatDay(latest.date) : undefined,
        })),
      },
    ],
  };
}
