import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-overview-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, createProject, runInProjectScope, saveGridSearch, type GridPoint } from '@/lib/db';
import { campaignSeriesId, saveCampaign, validateCampaign, type GridCampaignInput } from './campaigns-db';
import { listCampaignOverview } from './overview';

const input: GridCampaignInput = {
  name: 'Odonto', target: 'Clínica Sorriso', center: '-3.73,-38.52', grid_size: 3, spacing_km: 0.5, language: 'Portuguese',
  queue_mode: 'standard', frequency: 'monthly', weekday: null, month_day: 5, time_of_day: '03:00', time_zone: 'America/Fortaleza',
  keywords: ['dentista'], active: true, tags: ['Aldeota', ' odonto '], owner: ' Ana ',
};

const grid = (rank: number | null): GridPoint[] => [{ row: 0, col: 0, rank }, { row: 0, col: 1, rank }];

beforeAll(() => {
  const project = createProject({ name: 'Clínica', domain: 'clinica.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' });
  runInProjectScope(project.id, () => {
    const result = validateCampaign(input);
    if ('error' in result) throw new Error(result.error);
    const campaign = saveCampaign(result.campaign);
    const series = campaignSeriesId(campaign, 'dentista');
    const run = (id: string, ts: number, rank: number) => saveGridSearch({
      id, series_id: series, ts, keyword: 'dentista', target: campaign.target, center: campaign.center,
      grid_size: 3, spacing_km: 0.5, language: 'Portuguese', status: 'done', queue_mode: 'standard',
    }, grid(rank));
    run('old', 1000, 5);
    run('new', 2000, 2);
  });
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('listCampaignOverview', () => {
  it('summarises every client campaign with its latest scan and the change', () => {
    const rows = listCampaignOverview();
    const row = rows.find((item) => item.campaignName === 'Odonto');
    expect(row).toMatchObject({
      projectName: 'Clínica', tags: ['Aldeota', 'odonto'], owner: 'Ana', keywordCount: 1,
      avgPosition: 2, avgPositionDelta: -3, shareOfVoice: 60, lastRunTs: 2000,
      center: { lat: -3.73, lng: -38.52 },
    });
  });
});
