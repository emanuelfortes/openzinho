import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-jobs-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.BACKUP_DIR = path.join(tmpDir, 'backups');

import { closeAllDatabases, getProjects } from '@/lib/db';
import { foldersToPrune, runBackup } from '@/modules/backup/backup';
import { isJobDue, localDayAndHour, runDueJobs, type DailyJob } from './runner';

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const job = (run: DailyJob['run']): DailyJob => ({ id: 'teste', label: 'Teste', hour: 3, run });

describe('localDayAndHour', () => {
  it('uses the São Paulo calendar, not UTC', () => {
    // 02:30 UTC on 1 Nov is still 31 Oct, 23:30 in São Paulo.
    expect(localDayAndHour(new Date('2026-11-01T02:30:00Z'), 'America/Sao_Paulo')).toEqual({ day: '2026-10-31', hour: 23 });
  });
});

describe('isJobDue', () => {
  const at = (iso: string) => new Date(iso);
  it('waits for the job hour and runs once per day', () => {
    const j = job(async () => ({ ok: true, message: '' }));
    expect(isJobDue(j, null, at('2026-10-22T05:00:00Z'), 'America/Sao_Paulo')).toBe(false); // 02:00 local
    expect(isJobDue(j, null, at('2026-10-22T06:00:00Z'), 'America/Sao_Paulo')).toBe(true); // 03:00 local
    expect(isJobDue(j, { day: '2026-10-22', at: 0, ok: true, message: '' }, at('2026-10-22T20:00:00Z'), 'America/Sao_Paulo')).toBe(false);
  });
});

describe('runDueJobs', () => {
  it('records failures without stopping, and does not repeat on the same day', async () => {
    let calls = 0;
    const failing: DailyJob = { ...job(async () => { calls += 1; throw new Error('falhou'); }), id: 'quebra' };
    const now = new Date('2026-10-22T15:00:00Z');
    expect(await runDueJobs([failing], now)).toEqual([{ id: 'quebra', ok: false, message: 'falhou' }]);
    expect(await runDueJobs([failing], now)).toEqual([]);
    expect(calls).toBe(1);
  });
});

describe('backup', () => {
  it('copies every database into a dated folder', async () => {
    getProjects(); // creates the control and default project databases
    const result = await runBackup('2026-10-22');
    expect(result.ok).toBe(true);
    const files = fs.readdirSync(path.join(tmpDir, 'backups', '2026-10-22'));
    expect(files).toContain('projects.db');
  });

  it('keeps the last N days', () => {
    expect(foldersToPrune(['2026-10-01', '2026-10-08', '2026-10-09', '2026-10-22', 'outra'], '2026-10-22', 14)).toEqual(['2026-10-01', '2026-10-08']);
  });
});
