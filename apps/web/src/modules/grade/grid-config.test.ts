import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeGridConfig, gridConfigKey, normalizeGridConfig, normalizeGridDepth, normalizeGridDevice } from './grid-config';
import { estimateCampaign, pricePerTaskUsd, PRICE_PER_POINT_USD } from './estimate';
import { parseCampaignPrefill } from './campaigns-shared';
import { fetchGridSearch, localFinderTask, postGridTasksQueue } from '@/app/dashboard/local-finder/grid-api';

describe('grid device and depth', () => {
  it('defaults to desktop and 20, clamps depth to 20-100', () => {
    expect(normalizeGridConfig(undefined)).toEqual({ device: 'desktop', depth: 20 });
    expect(normalizeGridDevice('mobile')).toBe('mobile');
    expect(normalizeGridDevice('tablet')).toBe('desktop');
    expect(normalizeGridDepth('60')).toBe(60);
    expect(normalizeGridDepth(5)).toBe(20);
    expect(normalizeGridDepth(700)).toBe(100);
    expect(normalizeGridDepth('abc')).toBe(20);
  });

  it('adds nothing to the series key for the defaults', () => {
    expect(gridConfigKey({})).toBe('');
    expect(gridConfigKey({ device: 'desktop', depth: 20 })).toBe('');
    expect(gridConfigKey({ device: 'mobile', depth: 20 })).toBe('mobile|20');
    expect(describeGridConfig({ device: 'mobile', depth: 40 })).toBe('Celular · 40 resultados');
  });
});

describe('estimate by depth', () => {
  it('is flat per task for every depth', () => {
    expect(pricePerTaskUsd('standard', 100)).toBe(PRICE_PER_POINT_USD.standard);
    expect(pricePerTaskUsd('priority')).toBe(PRICE_PER_POINT_USD.priority);
    const base = { gridSize: 5, keywordCount: 2, frequency: 'weekly', queueMode: 'standard' as const };
    expect(estimateCampaign({ ...base, depth: 100 }).perMonthUsd).toBeCloseTo(estimateCampaign(base).perMonthUsd);
    expect(estimateCampaign({ ...base, depth: 100 }).pointsPerRun).toBe(50);
  });
});

describe('campaign prefill', () => {
  it('normalizes keywords, target and center', () => {
    expect(parseCampaignPrefill({ keywords: ' dentista, Dentista ,,clareamento  dental', target: '  Clínica  Sorriso ', center: '-3.7319, -38.5267' }))
      .toEqual({ keywords: ['dentista', 'clareamento dental'], target: 'Clínica Sorriso', center: '-3.7319,-38.5267' });
  });

  it('drops invalid values and caps the keyword count', () => {
    const prefill = parseCampaignPrefill({ keywords: Array.from({ length: 30 }, (_, i) => `kw ${i}`).join(','), center: 'Fortaleza' });
    expect(prefill.keywords).toHaveLength(20);
    expect(prefill.center).toBe('');
    expect(prefill.target).toBe('');
    expect(parseCampaignPrefill({ center: '200,10' }).center).toBe('');
    expect(parseCampaignPrefill({})).toEqual({ keywords: [], target: '', center: '' });
  });
});

describe('Local Finder payload', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(posted: Array<Record<string, unknown>>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
      posted.push(...body);
      const live = url.includes('/live/');
      return new Response(JSON.stringify({
        tasks: body.map((_, index) => live
          ? { status_code: 20000, cost: 0.002, result: [{ items: [] }] }
          : { id: `task-${index}`, status_code: 20100, cost: 0.0006 }),
      }));
    }));
  }

  it('posts the device and depth of the monitor in every queued task', async () => {
    const posted: Array<Record<string, unknown>> = [];
    stubFetch(posted);
    const result = await postGridTasksQueue('dentista', '-3.7319,-38.5267', 3, 0.5, 'Portuguese', 'l', 'p', 'priority', new Set(), { device: 'mobile', depth: 60 });
    expect(result.taskPoints).toHaveLength(9);
    expect(posted).toHaveLength(9);
    for (const task of posted) expect(task).toMatchObject({ device: 'mobile', depth: 60, priority: 2, language_name: 'Portuguese' });
  });

  it('defaults to desktop and 20, also on live runs', async () => {
    const posted: Array<Record<string, unknown>> = [];
    stubFetch(posted);
    await postGridTasksQueue('dentista', '-3.7319,-38.5267', 3, 0.5, 'Portuguese', 'l', 'p');
    await fetchGridSearch('dentista', '-3.7319,-38.5267', 3, 0.5, 'Portuguese', 'Clínica', 'l', 'p', new Set(), { device: 'mobile', depth: 40 });
    expect(posted.slice(0, 9).every((task) => task.device === 'desktop' && task.depth === 20 && task.priority === 1)).toBe(true);
    expect(posted.slice(9).every((task) => task.device === 'mobile' && task.depth === 40 && !('priority' in task))).toBe(true);
    expect(localFinderTask('x', 1, 2, 'Portuguese', { depth: 999 })).toMatchObject({ depth: 100, device: 'desktop', location_coordinate: '1.000000,2.000000' });
  });
});
