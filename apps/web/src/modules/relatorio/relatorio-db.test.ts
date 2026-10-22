import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relatorio-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.NEXO_TIME_ZONE = 'America/Sao_Paulo';

import { closeAllDatabases, createProject, getProjectDataDb, runInProjectScope, saveGridSearch, type GridPoint } from '@/lib/db';
import { campaignSeriesId, saveCampaign, validateCampaign, type GridCampaign, type GridCampaignInput } from '@/modules/grade/campaigns-db';
import { setInactivePoints } from '@/modules/grade/inactive-points-db';
import type { EmailMessage } from '@/modules/email/send';
import { runMonthlyReports } from './monthly-job';
import { buildCampaignReport } from './report-db';
import {
  createShareToken, hashToken, listShareTokens, publicBaseUrl, resolveShareToken, revokeShareTokens, TOKEN_PATTERN,
} from './share-tokens';

const input: GridCampaignInput = {
  name: 'Odonto', target: 'Clínica Sorriso', center: '-3.73,-38.52', grid_size: 3, spacing_km: 0.5, language: 'Portuguese',
  queue_mode: 'standard', frequency: 'monthly', weekday: null, month_day: 5, time_of_day: '03:00', time_zone: 'America/Sao_Paulo',
  keywords: ['dentista', 'implante'], active: true,
};

const grid = (rank: number | null): GridPoint[] =>
  Array.from({ length: 9 }, (_, index) => ({ row: Math.floor(index / 3), col: index % 3, rank }));

let projectId = '';
let campaign: GridCampaign;

beforeAll(() => {
  const project = createProject({ name: 'Clínica', domain: 'clinica-relatorio.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' });
  projectId = project.id;
  runInProjectScope(projectId, () => {
    const result = validateCampaign(input);
    if ('error' in result) throw new Error(result.error);
    campaign = saveCampaign(result.campaign);
    setInactivePoints(campaign, ['2:2']);
    const series = campaignSeriesId(campaign, 'dentista');
    const run = (id: string, iso: string, rank: number | null, status: 'done' | 'pending' = 'done') => saveGridSearch({
      id, series_id: series, ts: Date.parse(iso), keyword: 'dentista', target: campaign.target, center: campaign.center,
      grid_size: 3, spacing_km: 0.5, language: 'Portuguese', status, queue_mode: 'standard',
    }, grid(rank));
    run('ago-1', '2026-08-05T12:00:00Z', 9);
    run('ago-2', '2026-08-20T12:00:00Z', 6);
    run('set-1', '2026-09-05T12:00:00Z', 4);
    run('set-2', '2026-09-25T12:00:00Z', 2);
    run('set-pend', '2026-09-28T12:00:00Z', 20, 'pending');
    // 1 October 01:00 UTC is still 30 September in São Paulo.
    run('set-late', '2026-10-01T01:00:00Z', 1);
  });
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildCampaignReport', () => {
  it('uses the latest finished scan of each month in the campaign time zone', () => {
    const report = runInProjectScope(projectId, () => buildCampaignReport(campaign, '2026-09'));
    const dentista = report.keywords.find((keyword) => keyword.keyword === 'dentista')!;
    expect(dentista.current).toMatchObject({ ts: Date.parse('2026-10-01T01:00:00Z'), avgPosition: 1, activePoints: 8 });
    expect(dentista.previous).toMatchObject({ ts: Date.parse('2026-08-20T12:00:00Z'), avgPosition: 6 });
    expect(dentista.delta?.avgPosition).toBe(-5);
    const implante = report.keywords.find((keyword) => keyword.keyword === 'implante')!;
    expect(implante.current).toBeNull();
    expect(implante.missing[0]).toContain('setembro de 2026');
    expect(report.summary).toMatchObject({ keywordCount: 2, withCurrent: 1, compared: 1 });
  });
});

describe('share tokens', () => {
  it('stores only the hash and resolves the token to its project and campaign', () => {
    const token = runInProjectScope(projectId, () => createShareToken(campaign.id));
    expect(token).toMatch(TOKEN_PATTERN);
    const rows = getProjectDataDb(projectId).prepare('SELECT * FROM relatorio_share_tokens').all() as Array<Record<string, unknown>>;
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(resolveShareToken(token)).toEqual({ projectId, campaignId: campaign.id });
    expect(runInProjectScope(projectId, () => listShareTokens(campaign.id))[0].last_used_at).not.toBeNull();
  });

  it('rejects malformed, unknown and replaced tokens', () => {
    expect(resolveShareToken('../../etc')).toBeNull();
    expect(resolveShareToken('A'.repeat(43))).toBeNull();
    const first = runInProjectScope(projectId, () => createShareToken(campaign.id));
    const second = runInProjectScope(projectId, () => createShareToken(campaign.id));
    expect(resolveShareToken(first)).toBeNull();
    expect(resolveShareToken(second)).not.toBeNull();
    // A link of the other kind is independent.
    const email = runInProjectScope(projectId, () => createShareToken(campaign.id, 'email'));
    expect(resolveShareToken(second)).not.toBeNull();
    runInProjectScope(projectId, () => revokeShareTokens(campaign.id));
    expect(resolveShareToken(second)).toBeNull();
    expect(resolveShareToken(email)).toBeNull();
  });

  it('accepts only http(s) public base URLs', () => {
    expect(publicBaseUrl({ NEXO_PUBLIC_URL: 'https://nexo.exemplo.com/app/' })).toBe('https://nexo.exemplo.com/app');
    expect(publicBaseUrl({ NEXO_PUBLIC_URL: 'javascript:alert(1)' })).toBeNull();
    expect(publicBaseUrl({})).toBeNull();
  });
});

describe('runMonthlyReports', () => {
  const firstOfOctober = new Date('2026-10-01T11:00:00Z'); // 08:00 in São Paulo

  it('does nothing outside the 1st', async () => {
    expect(await runMonthlyReports(new Date('2026-10-02T11:00:00Z'), { configured: () => { throw new Error('não deveria checar'); } }))
      .toEqual({ ok: true, message: 'Não é dia 1.' });
  });

  it('fails clearly without e-mail configuration or recipients', async () => {
    expect(await runMonthlyReports(firstOfOctober, { configured: () => false })).toMatchObject({ ok: false, message: expect.stringContaining('não configurado') });
    expect(await runMonthlyReports(firstOfOctober, { configured: () => true, recipients: () => [] })).toMatchObject({ ok: false });
  });

  it('sends one e-mail per active campaign with a working link', async () => {
    const sent: EmailMessage[] = [];
    const result = await runMonthlyReports(firstOfOctober, {
      configured: () => true, recipients: () => ['agencia@exemplo.com'], baseUrl: () => 'https://nexo.exemplo.com',
      send: async (message) => { sent.push(message); return { sent: true, id: '1' }; },
    });
    expect(result.ok).toBe(true);
    const mine = sent.filter((message) => message.subject.includes('Odonto'));
    expect(mine).toHaveLength(1);
    expect(mine[0].subject).toContain('setembro de 2026');
    const link = /https:\/\/nexo\.exemplo\.com\/r\/([A-Za-z0-9_-]{43})\?mes=2026-09/.exec(mine[0].text);
    expect(link).not.toBeNull();
    expect(resolveShareToken(link![1])).toEqual({ projectId, campaignId: campaign.id });
    expect(mine[0].html).toContain('Abrir o relatório completo');
  });

  it('sends the summary without a link when NEXO_PUBLIC_URL is missing, and revokes links of failed sends', async () => {
    const sent: EmailMessage[] = [];
    const result = await runMonthlyReports(firstOfOctober, {
      configured: () => true, recipients: () => ['agencia@exemplo.com'], baseUrl: () => null,
      send: async (message) => { sent.push(message); return { sent: true, id: '1' }; },
    });
    expect(result.message).toContain('NEXO_PUBLIC_URL');
    expect(sent.find((message) => message.subject.includes('Odonto'))!.text).toContain('defina NEXO_PUBLIC_URL');

    const failed = await runMonthlyReports(firstOfOctober, {
      configured: () => true, recipients: () => ['agencia@exemplo.com'], baseUrl: () => 'https://nexo.exemplo.com',
      send: async () => ({ sent: false, reason: 'SMTP fora do ar' }),
    });
    expect(failed).toMatchObject({ ok: false, message: expect.stringContaining('SMTP fora do ar') });
    expect(runInProjectScope(projectId, () => listShareTokens(campaign.id)).filter((link) => link.kind === 'email')).toHaveLength(0);
  });
});
