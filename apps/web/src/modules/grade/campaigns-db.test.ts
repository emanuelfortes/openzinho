import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'grade-campaigns-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import {
  closeAllDatabases, claimDueGridSchedules, createProject, getGridEntry, getGridSchedule, runInProjectScope, saveGridSearch, saveGridSearchPending,
} from '@/lib/db';
import {
  campaignSeriesId, deleteCampaign, getCampaign, getCampaignKeywordStatus, getCampaignSpend, listCampaigns, runCampaignNow, saveCampaign, validateCampaign,
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

describe('campaign device and depth', () => {
  it('defaults to desktop and 20, stores the choice on the campaign and its schedules', () => scoped(() => {
    const plain = saveCampaign(valid({ ...base, keywords: ['dentista'] }));
    expect(getCampaign(plain.id)).toMatchObject({ device: 'desktop', depth: 20 });
    expect(getGridSchedule(campaignSeriesId(plain, 'dentista'))).toMatchObject({ device: 'desktop', depth: 20 });

    const mobile = saveCampaign(valid({ ...base, keywords: ['dentista'], device: 'mobile', depth: 250 }), plain.id);
    expect(getCampaign(plain.id)).toMatchObject({ device: 'mobile', depth: 100 });
    // A different device or depth is a different monitor; the desktop schedule is gone.
    expect(campaignSeriesId(mobile, 'dentista')).not.toBe(campaignSeriesId(plain, 'dentista'));
    expect(getGridSchedule(campaignSeriesId(plain, 'dentista'))).toBeNull();
    expect(getGridSchedule(campaignSeriesId(mobile, 'dentista'))).toMatchObject({ device: 'mobile', depth: 100, campaign_id: plain.id });
    deleteCampaign(plain.id);
  }));

  it('hands device and depth to the worker with each claimed schedule', () => {
    const campaign = scoped(() => saveCampaign(valid({ ...base, keywords: ['dentista'], device: 'mobile', depth: 40 })));
    scoped(() => runCampaignNow(campaign.id));
    const claimed = claimDueGridSchedules(Date.now() + 1_000).filter((schedule) => schedule.campaign_id === campaign.id);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({ device: 'mobile', depth: 40 });
    scoped(() => deleteCampaign(campaign.id));
  });

  it('records the configuration with each run', () => scoped(() => {
    const run = {
      id: 'run-config', ts: Date.now(), series_id: 'grid-config', keyword: 'dentista', target: 'x', center: '1,2',
      grid_size: 3, spacing_km: 1, language: 'Portuguese', status: 'pending' as const, queue_mode: 'standard' as const,
      device: 'mobile' as const, depth: 60, campaign_id: 'camp-1', cost: 0.01,
    };
    saveGridSearchPending(run, []);
    expect(getGridEntry('run-config')).toMatchObject({ device: 'mobile', depth: 60, campaign_id: 'camp-1' });
    saveGridSearch({ ...run, id: 'run-legacy', device: undefined, depth: undefined, campaign_id: undefined, status: 'done' }, []);
    expect(getGridEntry('run-legacy')).toMatchObject({ device: 'desktop', depth: 20, campaign_id: '' });
  }));
});

describe('campaign monthly spend', () => {
  it('sums runs of the campaign this month, also on grids it no longer uses', () => scoped(() => {
    const campaign = saveCampaign(valid({ ...base, keywords: ['dentista'] }));
    const oldSeries = campaignSeriesId(campaign, 'dentista');
    const entry = {
      ts: Date.now(), keyword: 'dentista', target: campaign.target, center: campaign.center, grid_size: 5, spacing_km: 0.5,
      language: 'Portuguese', status: 'done' as const, queue_mode: 'standard' as const,
    };
    saveGridSearch({ ...entry, id: 'spend-old-grid', series_id: oldSeries, campaign_id: campaign.id, cost: 0.015 }, []);
    // Last month: not counted.
    saveGridSearch({ ...entry, id: 'spend-last-month', series_id: oldSeries, campaign_id: campaign.id, cost: 1, ts: Date.now() - 40 * 86_400_000 }, []);
    // Another campaign: not counted.
    saveGridSearch({ ...entry, id: 'spend-other', series_id: 'grid-other', campaign_id: 'other-campaign', cost: 2 }, []);

    const moved = saveCampaign(valid({ ...base, keywords: ['dentista'], grid_size: 7 }), campaign.id);
    // A manual run of the current keyword from the Geo-grid page has no campaign_id but counts.
    saveGridSearch({ ...entry, id: 'spend-manual', series_id: campaignSeriesId(moved, 'dentista'), grid_size: 7, cost: 0.01 }, []);

    const since = Date.now() - 86_400_000;
    expect(getCampaignSpend(moved, since)).toBeCloseTo(0.025);
    deleteCampaign(campaign.id);
  }));
});
