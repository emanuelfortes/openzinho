import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-budget-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, createProject, runInProjectScope, saveGridSearch } from '@/lib/db';
import {
  BudgetTracker, evaluateBudget, getBudgetSettings, getBudgetStatus, parseMoney, saveBudgetSettings, saveClientCapBrl,
  recordSkippedRun, skippedRunsThisMonth,
} from './budget';

let clinic: string;
let bakery: string;

function spend(projectId: string, usd: number, ts = Date.now()) {
  runInProjectScope(projectId, () => saveGridSearch({
    id: `run-${Math.random()}`, series_id: 's', ts, keyword: 'dentista', target: 'x', center: '0,0',
    grid_size: 3, spacing_km: 1, language: 'Portuguese', status: 'done', queue_mode: 'standard', cost: usd,
  }, []));
}

beforeAll(() => {
  const base = { defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' };
  clinic = createProject({ ...base, name: 'Clínica', domain: 'clinica.example' }).id;
  bakery = createProject({ ...base, name: 'Padaria', domain: 'padaria.example' }).id;
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseMoney', () => {
  it('reads Brazilian and plain formats', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('R$ 80')).toBe(80);
    expect(parseMoney('5,60')).toBe(5.6);
    expect(parseMoney('12.5')).toBe(12.5);
  });

  it('treats blank, zero and garbage as no value', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('evaluateBudget', () => {
  const base = { monthLabel: 'outubro de 2026', brlPerUsd: 5.6, clientCapBrl: 100, globalSpentUsd: 0, globalCapBrl: null };

  it('blocks at the client cap and warns from 80%', () => {
    expect(evaluateBudget({ ...base, clientSpentUsd: 10 }).warning).toBe(false); // R$ 56
    expect(evaluateBudget({ ...base, clientSpentUsd: 15 }).warning).toBe(true); // R$ 84
    const blocked = evaluateBudget({ ...base, clientSpentUsd: 18 }); // R$ 100,80
    expect(blocked.blocked).toBe(true);
    expect(blocked.warning).toBe(false);
    expect(blocked.reason).toContain('teto mensal deste cliente');
  });

  it('blocks everyone at the global cap', () => {
    const status = evaluateBudget({ ...base, clientCapBrl: null, clientSpentUsd: 1, globalSpentUsd: 20, globalCapBrl: 100 });
    expect(status.blocked).toBe(true);
    expect(status.reason).toContain('todos os clientes');
  });

  it('never blocks without caps', () => {
    expect(evaluateBudget({ ...base, clientCapBrl: null, clientSpentUsd: 1e6 }).blocked).toBe(false);
  });
});

describe('budget storage and month-to-date spend', () => {
  it('defaults to R$ 5,60 per dollar and no caps', () => {
    expect(getBudgetSettings()).toEqual({ brlPerUsd: 5.6, globalCapBrl: null });
  });

  it('sums this month only, per client and across clients', () => {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    spend(clinic, 10);
    spend(clinic, 99, lastMonth.getTime());
    spend(bakery, 5);
    saveBudgetSettings({ brlPerUsd: 5, globalCapBrl: 1000 });
    saveClientCapBrl(clinic, 40);

    const status = getBudgetStatus(clinic);
    expect(status.clientSpentBrl).toBe(50);
    expect(status.globalSpentBrl).toBe(75);
    expect(status.blocked).toBe(true);
    expect(getBudgetStatus(bakery).blocked).toBe(false);
  });

  it('lets the worker add what it posts during a pass', () => {
    saveClientCapBrl(bakery, 30);
    const tracker = new BudgetTracker();
    expect(tracker.status(bakery).blocked).toBe(false); // R$ 25
    tracker.add(bakery, 1); // + R$ 5
    expect(tracker.status(bakery).blocked).toBe(true);
  });

  it('counts runs skipped this month', () => {
    recordSkippedRun(clinic);
    recordSkippedRun(clinic);
    expect(skippedRunsThisMonth(clinic)).toBe(2);
    expect(skippedRunsThisMonth(bakery)).toBe(0);
  });

  it('removes caps saved as blank', () => {
    saveClientCapBrl(clinic, null);
    saveBudgetSettings({ brlPerUsd: null, globalCapBrl: null });
    expect(getBudgetStatus(clinic).blocked).toBe(false);
    expect(getBudgetSettings().brlPerUsd).toBe(5.6);
  });
});
