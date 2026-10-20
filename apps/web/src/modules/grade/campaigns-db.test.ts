import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-campaigns-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, claimDueGridSchedules, createProject, getGridSchedule, runInProjectScope } from '@/lib/db';
import {
  campaignSeriesId, deleteCampaign, getCampaignKeywordStatus, listCampaigns, runCampaignNow, saveCampaign, validateCampaign,
  type GridCampaignInput,
} from './campaigns-db';

let projectId: string;
const scoped = <T>(operation: () => T) => runInProjectScope(projectId, operation);

const base: GridCampaignInput = {
  name: 'Clínica Sorriso', target: 'Clínica Sorriso (cid:123)', center: '-3.7319, -38.5267', grid_size: 5, spacing_km: 0.5,
  language: 'Portuguese', queue_mode: 'standard', frequency: 'biweekly', weekday: 1, month_day: null,
  time_of_day: '03:00', time_zone: 'America/Fortaleza', keywords: ['dentista', 'Dentista ', '', 'clareamento dental'], active: true,
};

function valid(input: GridCampaignInput): GridCampaignInput {
  const result = validateCampaign(input);
  if ('error' in result) throw new Error(result.error);
  return result.campaign;
}

beforeAll(() => {
  projectId = createProject({
    name: 'Campaigns', domain: 'campaigns.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100',
  }).id;
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('validateCampaign', () => {
  it('cleans keywords and the center', () => {
    const campaign = valid(base);
    expect(campaign.keywords).toEqual(['dentista', 'clareamento dental']);
    expect(campaign.center).toBe('-3.7319,-38.5267');
  });

  it('rejects missing or invalid fields', () => {
    expect(validateCampaign({ ...base, keywords: [' '] })).toEqual({ error: 'Adicione pelo menos uma palavra-chave.' });
    expect('error' in validateCampaign({ ...base, center: 'Fortaleza' })).toBe(true);
    expect('error' in validateCampaign({ ...base, grid_size: 6 })).toBe(true);
    expect('error' in validateCampaign({ ...base, keywords: Array.from({ length: 21 }, (_, i) => `kw ${i}`) })).toBe(true);
  });
});

describe('campaign schedules', () => {
  it('creates one tagged schedule per keyword', () => scoped(() => {
    const campaign = saveCampaign(valid(base));
    const statuses = getCampaignKeywordStatus(campaign);
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      const schedule = getGridSchedule(status.series_id);
      expect(schedule?.campaign_id).toBe(campaign.id);
      expect(schedule?.frequency).toBe('biweekly');
      expect(status.next_run_at).toBe(schedule?.next_run_at);
    }
    deleteCampaign(campaign.id);
  }));

  it('runs every keyword now, then waits two weeks', () => {
    const campaign = scoped(() => saveCampaign(valid(base)));
    const queued = scoped(() => runCampaignNow(campaign.id));
    expect(queued).toBe(2);

    const now = Date.now() + 1_000;
    const claimed = claimDueGridSchedules(now).filter((schedule) => schedule.campaign_id === campaign.id);
    expect(claimed.map((schedule) => schedule.keyword).sort()).toEqual(['clareamento dental', 'dentista']);
    for (const schedule of claimed) {
      expect(schedule.next_run_at - now).toBeGreaterThan(13 * 86_400_000);
      expect(schedule.next_run_at - now).toBeLessThan(21 * 86_400_000);
    }
    scoped(() => deleteCampaign(campaign.id));
  });

  it('drops schedules for removed keywords and while paused', () => scoped(() => {
    const campaign = saveCampaign(valid(base));
    const removed = campaignSeriesId(campaign, 'clareamento dental');
    saveCampaign(valid({ ...base, keywords: ['dentista'] }), campaign.id);
    expect(getGridSchedule(removed)).toBeNull();
    expect(getGridSchedule(campaignSeriesId(campaign, 'dentista'))).not.toBeNull();

    saveCampaign(valid({ ...base, keywords: ['dentista'], active: false }), campaign.id);
    expect(getGridSchedule(campaignSeriesId(campaign, 'dentista'))).toBeNull();
    expect(listCampaigns().find((item) => item.id === campaign.id)?.active).toBe(false);
    deleteCampaign(campaign.id);
  }));

  it('starts new series when the grid changes', () => scoped(() => {
    const campaign = saveCampaign(valid({ ...base, keywords: ['dentista'] }));
    const before = campaignSeriesId(campaign, 'dentista');
    const moved = saveCampaign(valid({ ...base, keywords: ['dentista'], grid_size: 7 }), campaign.id);
    expect(getGridSchedule(before)).toBeNull();
    expect(getGridSchedule(campaignSeriesId(moved, 'dentista'))?.grid_size).toBe(7);
    deleteCampaign(campaign.id);
    expect(listCampaigns().some((item) => item.id === campaign.id)).toBe(false);
  }));
});
