// Geo-grid campaigns: several keywords monitored on the same grid with one schedule.
// Each keyword is still an ordinary monitor (a grid_schedules row and a grid_searches series)
// tagged with the campaign ID, so the existing worker, timeline and PDF keep working unchanged.
import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import {
  deleteGridSchedule, getProjectDataDb, gridSeriesId, saveGridSchedule, GRID_SCHEDULE_FREQUENCIES,
  type GridScheduleFrequency,
} from '@/lib/db';
import { clampMonthDay } from './cadence';
import {
  CAMPAIGN_GRID_SIZES, MAX_CAMPAIGN_KEYWORDS, normalizeKeywords, normalizeTags, parseCenter,
  type GridCampaign, type GridCampaignInput,
} from './campaigns-shared';

export * from './campaigns-shared';

export interface CampaignKeywordStatus {
  keyword: string;
  series_id: string;
  next_run_at: number | null;
  latestRun: { id: string; ts: number; status: string } | null;
  latestDoneRunId: string | null;
}

const initialised = new WeakSet<Database.Database>();

function db(): Database.Database {
  const handle = getProjectDataDb();
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS grade_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        target TEXT NOT NULL,
        center TEXT NOT NULL,
        grid_size INTEGER NOT NULL,
        spacing_km REAL NOT NULL,
        language TEXT NOT NULL,
        queue_mode TEXT NOT NULL,
        frequency TEXT NOT NULL,
        weekday INTEGER,
        month_day INTEGER,
        time_of_day TEXT NOT NULL,
        time_zone TEXT NOT NULL,
        keywords TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    for (const column of [`tags TEXT NOT NULL DEFAULT '[]'`, `owner TEXT NOT NULL DEFAULT ''`]) {
      try {
        handle.exec(`ALTER TABLE grade_campaigns ADD COLUMN ${column}`);
      } catch (error) {
        if (!(error instanceof Error && /duplicate column name/i.test(error.message))) throw error;
      }
    }
    initialised.add(handle);
  }
  return handle;
}

type CampaignRow = Omit<GridCampaign, 'keywords' | 'active' | 'queue_mode' | 'frequency' | 'tags' | 'owner'> & {
  keywords: string; active: number; queue_mode: string; frequency: string; tags: string | null; owner: string | null;
};

function fromRow(row: CampaignRow): GridCampaign {
  return {
    ...row,
    queue_mode: row.queue_mode === 'priority' ? 'priority' : 'standard',
    frequency: row.frequency as GridScheduleFrequency,
    keywords: JSON.parse(row.keywords) as string[],
    active: row.active === 1,
    tags: row.tags ? JSON.parse(row.tags) as string[] : [],
    owner: row.owner ?? '',
  };
}

/** Returns the cleaned input, or the first problem found. */
export function validateCampaign(input: GridCampaignInput): { campaign: GridCampaignInput } | { error: string } {
  const name = input.name.trim();
  const target = input.target.trim();
  const keywords = normalizeKeywords(input.keywords);
  const center = parseCenter(input.center);
  if (!name) return { error: 'Dê um nome à campanha.' };
  if (!target) return { error: 'Escolha a empresa a acompanhar (selecione no mapa ou digite o nome ou domínio).' };
  if (!center) return { error: 'Defina o centro da grade no mapa ou digite-o como lat,lng.' };
  if (keywords.length === 0) return { error: 'Adicione pelo menos uma palavra-chave.' };
  if (keywords.length > MAX_CAMPAIGN_KEYWORDS) return { error: `Uma campanha pode acompanhar até ${MAX_CAMPAIGN_KEYWORDS} palavras-chave.` };
  if (!(CAMPAIGN_GRID_SIZES as readonly number[]).includes(input.grid_size)) return { error: 'Escolha o tamanho da grade.' };
  if (!(input.spacing_km > 0 && input.spacing_km <= 10)) return { error: 'Escolha a distância entre os pontos.' };
  if (!GRID_SCHEDULE_FREQUENCIES.includes(input.frequency)) return { error: 'Escolha com que frequência a campanha é executada.' };
  const usesWeekday = input.frequency === 'weekly' || input.frequency === 'biweekly';
  return {
    campaign: {
      ...input,
      name,
      target,
      keywords,
      center: `${center.lat},${center.lng}`,
      language: input.language.trim() || 'Portuguese',
      tags: normalizeTags(input.tags),
      owner: (input.owner ?? '').trim().slice(0, 80),
      weekday: usesWeekday ? (input.weekday != null && input.weekday >= 0 && input.weekday <= 6 ? input.weekday : 1) : null,
      month_day: input.frequency === 'monthly' ? clampMonthDay(input.month_day) : null,
    },
  };
}

export function campaignSeriesId(campaign: Pick<GridCampaignInput, 'center' | 'grid_size' | 'spacing_km' | 'target' | 'language'>, keyword: string): string {
  return gridSeriesId(keyword, campaign.center, campaign.grid_size, campaign.spacing_km, campaign.target, campaign.language);
}

export function listCampaigns(): GridCampaign[] {
  return (db().prepare('SELECT * FROM grade_campaigns ORDER BY name COLLATE NOCASE').all() as CampaignRow[]).map(fromRow);
}

export function getCampaign(id: string): GridCampaign | null {
  const row = db().prepare('SELECT * FROM grade_campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
  return row ? fromRow(row) : null;
}

function scheduledSeries(campaignId: string): string[] {
  return (db().prepare('SELECT series_id FROM grid_schedules WHERE campaign_id = ?').all(campaignId) as Array<{ series_id: string }>)
    .map((row) => row.series_id);
}

/**
 * Saves the campaign and makes its schedules match it: one per keyword while active, none while paused.
 * Changing the grid starts new series; earlier runs stay in history with the configuration they used.
 */
export function saveCampaign(input: GridCampaignInput, id?: string): GridCampaign {
  const now = Date.now();
  const existing = id ? getCampaign(id) : null;
  const campaign: GridCampaign = { ...input, id: existing?.id ?? randomUUID(), created_at: existing?.created_at ?? now, updated_at: now };
  const handle = db();

  handle.transaction(() => {
    handle.prepare(`INSERT INTO grade_campaigns
      (id, name, target, center, grid_size, spacing_km, language, queue_mode, frequency, weekday, month_day, time_of_day, time_zone, keywords, active, tags, owner, created_at, updated_at)
      VALUES (@id, @name, @target, @center, @grid_size, @spacing_km, @language, @queue_mode, @frequency, @weekday, @month_day, @time_of_day, @time_zone, @keywords, @active, @tags, @owner, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, target = excluded.target, center = excluded.center, grid_size = excluded.grid_size,
        spacing_km = excluded.spacing_km, language = excluded.language, queue_mode = excluded.queue_mode,
        frequency = excluded.frequency, weekday = excluded.weekday, month_day = excluded.month_day,
        time_of_day = excluded.time_of_day, time_zone = excluded.time_zone, keywords = excluded.keywords,
        active = excluded.active, tags = excluded.tags, owner = excluded.owner, updated_at = excluded.updated_at`)
      .run({
        ...campaign, keywords: JSON.stringify(campaign.keywords), active: campaign.active ? 1 : 0,
        tags: JSON.stringify(normalizeTags(campaign.tags)), owner: campaign.owner ?? '',
      });

    const wanted = new Map(campaign.keywords.map((keyword) => [campaignSeriesId(campaign, keyword), keyword]));
    for (const seriesId of scheduledSeries(campaign.id)) {
      if (!campaign.active || !wanted.has(seriesId)) deleteGridSchedule(seriesId);
    }
    if (!campaign.active) return;
    for (const [seriesId, keyword] of wanted) {
      saveGridSchedule({
        series_id: seriesId, keyword, target: campaign.target, center: campaign.center,
        grid_size: campaign.grid_size, spacing_km: campaign.spacing_km, language: campaign.language,
        queue_mode: campaign.queue_mode, frequency: campaign.frequency, weekday: campaign.weekday, month_day: campaign.month_day,
        campaign_id: campaign.id, time_of_day: campaign.time_of_day, time_zone: campaign.time_zone,
      });
    }
  })();
  return campaign;
}

/** Removes the campaign and its schedules. Runs already made stay available as monitors. */
export function deleteCampaign(id: string): void {
  const handle = db();
  handle.transaction(() => {
    for (const seriesId of scheduledSeries(id)) deleteGridSchedule(seriesId);
    handle.prepare('DELETE FROM grade_campaigns WHERE id = ?').run(id);
  })();
}

/** Makes every keyword due now; the worker posts them on its next pass (about a minute). */
export function runCampaignNow(id: string): number {
  return db().prepare('UPDATE grid_schedules SET next_run_at = ?, updated_at = ? WHERE campaign_id = ?')
    .run(Date.now(), Date.now(), id).changes;
}

export function getCampaignKeywordStatus(campaign: GridCampaign): CampaignKeywordStatus[] {
  const handle = db();
  const schedule = handle.prepare('SELECT next_run_at FROM grid_schedules WHERE series_id = ? AND campaign_id = ?');
  const latest = handle.prepare('SELECT id, ts, status FROM grid_searches WHERE series_id = ? ORDER BY ts DESC LIMIT 1');
  const latestDone = handle.prepare(`SELECT id FROM grid_searches WHERE series_id = ? AND status = 'done' ORDER BY ts DESC LIMIT 1`);
  return campaign.keywords.map((keyword) => {
    const seriesId = campaignSeriesId(campaign, keyword);
    const scheduled = schedule.get(seriesId, campaign.id) as { next_run_at: number } | undefined;
    const run = latest.get(seriesId) as { id: string; ts: number; status: string } | undefined;
    const done = latestDone.get(seriesId) as { id: string } | undefined;
    return { keyword, series_id: seriesId, next_run_at: scheduled?.next_run_at ?? null, latestRun: run ?? null, latestDoneRunId: done?.id ?? null };
  });
}

/** DataForSEO cost reported for the campaign's runs since `since`, in USD. */
export function getCampaignSpend(campaign: GridCampaign, since: number): number {
  const seriesIds = campaign.keywords.map((keyword) => campaignSeriesId(campaign, keyword));
  if (seriesIds.length === 0) return 0;
  const row = db().prepare(`SELECT COALESCE(SUM(cost), 0) AS total FROM grid_searches
    WHERE ts >= ? AND series_id IN (${seriesIds.map(() => '?').join(', ')})`).get(since, ...seriesIds) as { total: number };
  return row.total;
}
