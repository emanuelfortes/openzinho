import { describe, it, expect } from 'vitest';
import type { PromptCheck, TrackedPrompt } from './db';
import { calendarMarkdown, checkStatus, formatDay, formatRate, overviewMarkdown, overviewPdf, promptMarkdown, promptPdf, recentStrip } from './prompt-report';

function check(date: string, over: Partial<PromptCheck> = {}): PromptCheck {
  const [y, m, d] = date.split('-').map(Number);
  return {
    id: 0, promptId: 1, checkedAt: Date.UTC(y, m - 1, d, 9), date, platform: 'chat_gpt', model: 'gpt-5.5',
    mentioned: false, brandMentions: 0, domainCited: false, answer: null, sources: [], cost: 0.01, error: null, ...over,
  };
}

const prompt: TrackedPrompt = {
  id: 1, prompt: 'Best plumber in Paris?', platform: 'chat_gpt', model: 'gpt-5.5', webSearch: true,
  countryCode: 'FR', brand: 'Acme', domain: 'acme.com', createdAt: 0,
};

describe('checkStatus and rates', () => {
  it('maps a check to cited, not cited or error', () => {
    expect(checkStatus({ mentioned: true, error: null })).toBe('cited');
    expect(checkStatus({ mentioned: false, error: null })).toBe('not-cited');
    expect(checkStatus({ mentioned: false, error: 'boom' })).toBe('error');
  });

  it('formats the mention rate', () => {
    expect(formatRate(0, 0)).toBe('—');
    expect(formatRate(5, 3)).toBe('3 / 5 (60%)');
  });
});

describe('calendarMarkdown', () => {
  it('places each day in its weekday column with the status emoji', () => {
    // 2026-10-05 is a Monday, 2026-10-07 a Wednesday.
    const grid = calendarMarkdown([check('2026-10-05', { mentioned: true }), check('2026-10-07')]);
    const [, , week] = grid.split('\n');
    expect(week).toBe('| 2026-10-05 | 🟢 5 | ⬜ 6 | ⚪ 7 |  |  |  |  |');
  });

  it('keeps only the latest check of a day', () => {
    const early = check('2026-10-05', { mentioned: true, checkedAt: Date.UTC(2026, 9, 5, 8) });
    const late = check('2026-10-05', { mentioned: false, checkedAt: Date.UTC(2026, 9, 5, 20) });
    expect(calendarMarkdown([early, late]).split('\n')[2]).toContain('⚪ 5');
  });

  it('adds a row for each week in the range', () => {
    const grid = calendarMarkdown([check('2026-10-01'), check('2026-10-15')]);
    expect(grid.split('\n').length).toBe(2 + 3); // header, divider, weeks of 28 Sep, 5 Oct, 12 Oct
  });

  it('says so when there are no checks', () => {
    expect(calendarMarkdown([])).toContain('Nenhuma verificação ainda');
  });
});

describe('recentStrip', () => {
  it('shows the most recent checks, oldest first', () => {
    const checks = [check('2026-10-01', { mentioned: true }), check('2026-10-02'), check('2026-10-03', { error: 'x' })];
    expect(recentStrip(checks)).toBe('🟢⚪🔴');
    expect(recentStrip(checks, 2)).toBe('⚪🔴');
  });
});

describe('promptMarkdown', () => {
  it('builds the settings, calendar and history sections', () => {
    const md = promptMarkdown({
      prompt, checks: [check('2026-10-05', { mentioned: true, brandMentions: 2, answer: 'Acme | is **great**\nreally' })],
      total: 1, mentioned: 1, generatedAt: Date.UTC(2026, 9, 8, 12),
    });
    expect(md).toContain('# Relatório do prompt');
    expect(md).toContain('ChatGPT · gpt-5.5 · busca na web ativada · FR');
    expect(md).toContain('marca "Acme" e domínio acme.com');
    expect(md).toContain('**Taxa de menção:** 1 / 1 (100%)');
    expect(md).toContain('## Calendário');
    expect(md).toContain('| 2026-10-05 | 🟢 Citado | 2 | não | US$ 0,0100 | Acme \\| is **great** really |');
  });
});

describe('overviewMarkdown and promptPdf', () => {
  it('lists every prompt with its latest status', () => {
    const latest = check('2026-10-05', { mentioned: true });
    const md = overviewMarkdown([{ prompt, checks: [latest], total: 1, mentioned: 1, latest }], Date.UTC(2026, 9, 8));
    expect(md).toContain('| Best plumber in Paris? | ChatGPT gpt-5.5 | Acme · acme.com | 🟢 Citado | 1 / 1 (100%) | 🟢 |');
  });

  it('builds the single prompt PDF with a status card per check and a calendar', () => {
    const checks = [check('2026-10-05', { mentioned: true, brandMentions: 2, domainCited: true }), check('2026-10-07', { error: 'rate limit' })];
    const pdf = promptPdf({ prompt, checks, total: 1, mentioned: 1, generatedAt: 0 });
    expect(pdf.metrics[0]).toMatchObject({ label: 'Último resultado', value: 'Erro', status: 'error' });
    expect(pdf.metrics[1]).toMatchObject({ label: 'Taxa de menção', value: '100%' });
    const calendar = pdf.sections.find((s) => s.title === 'Calendário')?.calendar;
    expect(calendar?.weeks).toHaveLength(1);
    expect(calendar?.weeks[0].days.slice(0, 3)).toEqual([
      { day: 5, status: 'cited' }, { day: 6, status: null }, { day: 7, status: 'error' },
    ]);
    const cards = pdf.sections.find((s) => s.title === 'Histórico de verificações')?.statusItems;
    expect(cards?.[0]).toEqual({ status: 'error', title: 'Qua 7 out 2026', subtitle: 'rate limit', badge: 'Erro' });
    expect(cards?.[1]).toEqual({ status: 'cited', title: 'Seg 5 out 2026', subtitle: '2 menções à marca - domínio citado', badge: 'Citado' });
  });

  it('shows only the latest result of each prompt in the overview PDF', () => {
    const cited = check('2026-10-05', { mentioned: true });
    const older = check('2026-10-01');
    const other: TrackedPrompt = { ...prompt, id: 2, prompt: 'Never checked?' };
    const pdf = overviewPdf([
      { prompt, checks: [cited, older], total: 2, mentioned: 1, latest: cited },
      { prompt: other, checks: [], total: 0, mentioned: 0, latest: undefined },
    ]);
    expect(pdf.metrics.map((m) => m.value)).toEqual(['2', '1 / 2', '0 / 2']);
    const cards = pdf.sections[0].statusItems!;
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ status: 'cited', title: 'Best plumber in Paris?', badge: 'Citado', note: '5 out 2026' });
    expect(cards[1]).toMatchObject({ status: 'none', badge: 'Não verificado' });
  });

  it('formats days without a locale', () => {
    expect(formatDay('2026-10-08')).toBe('8 out 2026');
    expect(formatDay('2026-10-08', true)).toBe('Qui 8 out 2026');
  });
});
