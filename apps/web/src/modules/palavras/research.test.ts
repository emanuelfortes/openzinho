import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'palavras-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, createProject, getProjectDataDb, runInProjectScope } from '@/lib/db';
import { evaluateBudget } from '@/modules/custos/budget-shared';
import { ENDPOINTS } from './estimate';
import { GBP_FIXTURE, gbpResult, HOMEPAGE_HTML, mapsResult, overviewResult } from './fixtures';
import { findRecentPesquisa, getPesquisa, hidePesquisa, listPesquisas, PALAVRAS_TABLE } from './palavras-db';
import { runResearch, type DfsCaller, type ResearchDeps } from './research';
import { executeResearch, prepareEstimate, validateInput } from './service';
import type { ResearchInput } from './types';

let projectId: string;
const scoped = <T>(operation: () => T) => runInProjectScope(projectId, operation);
const okBudget = evaluateBudget({ monthLabel: 'outubro de 2026', brlPerUsd: 5.6, clientSpentUsd: 0, clientCapBrl: null, globalSpentUsd: 0, globalCapBrl: null });

const VOLUMES = { dentista: 90500, 'clínica odontológica': 8100, 'implante dentário': 18100, ortodontista: 9900, 'clareamento dental': 22200, 'lentes de contato dental': 14800 };

/** Fake DataForSEO client: records calls, answers with recorded-shape fixtures and per-task costs. */
function fakeClient(options: { failSite?: boolean; failDemand?: boolean } = {}) {
  const calls: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
  const call: DfsCaller = async <T,>(endpoint: string, body: Record<string, unknown>) => {
    calls.push({ endpoint, body });
    const answer = (result: unknown, cost: number) => ({ result: result as T[], cost });
    if (endpoint === ENDPOINTS.gbp) return answer(gbpResult(GBP_FIXTURE), 0.0054);
    if (endpoint === ENDPOINTS.demand) return options.failDemand ? { error: 'DataForSEO: falha simulada' } : answer(overviewResult(VOLUMES), 0.0106);
    if (endpoint === ENDPOINTS.maps) return answer(mapsResult(body.keyword === 'dentista' ? 3 : null), 0.002);
    if (endpoint === ENDPOINTS.site) return answer([{ items: [{ meta: { title: 'Dentista', htags: { h1: ['Implantes'] } } }] }], 0.000125);
    return { error: `endpoint inesperado ${endpoint}` };
  };
  const deps: ResearchDeps = {
    call,
    fetchHtml: async () => (options.failSite ? { error: 'O site respondeu HTTP 503.' } : { html: HOMEPAGE_HTML, finalUrl: 'https://sorrisofeliz.com.br/' }),
    now: () => new Date('2026-10-22T12:00:00Z'),
  };
  return { calls, deps };
}

const input: ResearchInput = {
  business: 'Clínica Sorriso Feliz', cid: '1234567890123', website: 'https://sorrisofeliz.com.br/', location: 'Sao Paulo,State of Sao Paulo,Brazil', language: 'Portuguese', mapsProbe: true,
};

beforeAll(() => {
  projectId = createProject({
    name: 'Palavras', domain: 'sorrisofeliz.com.br', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100',
  }).id;
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runResearch', () => {
  it('runs GBP, free homepage read, one demand task and one Maps probe per chosen query', async () => {
    const { calls, deps } = fakeClient();
    const result = await runResearch(input, deps);
    expect(calls[0]).toEqual({ endpoint: ENDPOINTS.gbp, body: { keyword: 'cid:1234567890123', location_name: input.location, language_name: 'Portuguese' } });
    expect(calls.filter((c) => c.endpoint === ENDPOINTS.site)).toHaveLength(0);
    const demand = calls.filter((c) => c.endpoint === ENDPOINTS.demand);
    expect(demand).toHaveLength(1);
    expect(demand[0].body.location_name).toBe('Brazil');
    expect((demand[0].body.keywords as string[]).length).toBeLessThanOrEqual(30);
    const probes = calls.filter((c) => c.endpoint === ENDPOINTS.maps);
    expect(probes).toHaveLength(result.selection.selected.length);

    expect(result.selection.scope).toBe('completo');
    expect(result.selection.selected.map((t) => t.query)).toEqual(expect.arrayContaining(['dentista', 'implante dentário', 'ortodontista']));
    const dentista = result.selection.selected.find((t) => t.query === 'dentista')!;
    expect(dentista.probe).toMatchObject({ status: 'ok', resultCount: 10, targetPosition: 3 });
    expect(dentista.evidence.some((e) => e.kind === 'maps' && e.quote.includes('posição 3'))).toBe(true);
    expect(result.website?.via).toBe('direto');
    expect(result.totalCostUsd).toBeCloseTo(0.0054 + 0.0106 + 0.002 * probes.length, 6);
    expect(result.limitations.join(' ')).toMatch(/nacional/);
  });

  it('falls back to instant_pages and records the failure without inventing evidence', async () => {
    const { calls, deps } = fakeClient({ failSite: true });
    const result = await runResearch({ ...input, mapsProbe: false }, deps);
    expect(calls.map((c) => c.endpoint)).toEqual([ENDPOINTS.gbp, ENDPOINTS.site, ENDPOINTS.demand]);
    expect(result.website?.via).toBe('instant_pages');
    expect(result.sources.find((s) => s.endpoint === 'leitura direta do HTML')?.message).toMatch(/503/);
  });

  it('keeps going when demand fails and says so', async () => {
    const { deps } = fakeClient({ failDemand: true });
    const result = await runResearch({ ...input, mapsProbe: false }, deps);
    expect(result.selection.selected.length).toBeGreaterThanOrEqual(3);
    expect(result.selection.selected.every((t) => t.volume === null)).toBe(true);
    expect(result.limitations.join(' ')).toMatch(/não pôde ser medido/);
  });
});

describe('service (action flow)', () => {
  it('validates the form', () => {
    expect(validateInput({})).toEqual({ error: 'Informe a empresa (nome ou link do Google Maps) ou o site.' });
    expect(validateInput({ website: 'http://localhost' })).toMatchObject({ error: expect.stringMatching(/site público/) });
    const ok = validateInput({ business: 'https://maps.google.com/?cid=555666777', language: 'Klingon' });
    expect(ok).toEqual({ input: { business: '', cid: '555666777', website: '', location: 'Sao Paulo,State of Sao Paulo,Brazil', language: 'Portuguese', mapsProbe: false } });
  });

  it('refuses to run without the confirmed estimate or over the cap, and makes no call', async () => {
    const { calls, deps } = fakeClient();
    const form = { ...input, cid: input.cid ?? undefined };
    expect(await scoped(() => executeResearch(form, 0.001, { deps, budget: okBudget }))).toEqual({ error: 'Confirme a estimativa atual antes de pesquisar.' });
    const blocked = evaluateBudget({ monthLabel: 'outubro de 2026', brlPerUsd: 5.6, clientSpentUsd: 20, clientCapBrl: 100, globalSpentUsd: 20, globalCapBrl: null });
    expect(await scoped(() => executeResearch(form, 1, { deps, budget: blocked }))).toMatchObject({ error: expect.stringMatching(/teto/) });
    expect(await scoped(() => executeResearch(form, 1, { deps: null, budget: okBudget }))).toMatchObject({ error: expect.stringMatching(/Credenciais/) });
    expect(calls).toHaveLength(0);
  });

  it('estimates, runs, saves, and offers the saved research instead of paying again', async () => {
    const { deps } = fakeClient();
    const form = { ...input, cid: input.cid ?? undefined };
    const estimate = scoped(() => prepareEstimate(form, okBudget));
    if ('error' in estimate) throw new Error(estimate.error);
    expect(estimate.existing).toBeNull();
    expect(estimate.blockReason).toBeNull();

    const run = await scoped(() => executeResearch(form, estimate.estimate.totalUsd, { deps, budget: okBudget }));
    if ('error' in run) throw new Error(run.error);
    const saved = scoped(() => getPesquisa(run.id))!;
    expect(saved.selection.selected.length).toBeGreaterThanOrEqual(3);
    expect(scoped(() => listPesquisas())[0]).toMatchObject({ id: run.id, business: 'Clínica Sorriso Feliz', scope: 'completo' });

    const again = scoped(() => prepareEstimate(form, okBudget));
    if ('error' in again) throw new Error(again.error);
    expect(again.existing?.id).toBe(run.id);
    expect(scoped(() => findRecentPesquisa({ ...input, mapsProbe: false }))).toBeNull();

    // The cost is stored in the convention the Spending page reads (ts + cost columns).
    const row = scoped(() => getProjectDataDb().prepare(`SELECT ts, cost FROM ${PALAVRAS_TABLE} WHERE id = ?`).get(run.id)) as { ts: number; cost: number };
    expect(row.cost).toBeCloseTo(saved.totalCostUsd, 6);
    expect(row.cost).toBeGreaterThan(0);

    scoped(() => hidePesquisa(run.id));
    expect(scoped(() => listPesquisas())).toHaveLength(0);
  });
});
