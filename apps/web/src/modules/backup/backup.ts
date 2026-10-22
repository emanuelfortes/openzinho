// Daily copy of every SQLite file (control, login, one per project) with SQLite's online
// backup, so a copy taken while the app writes is still consistent. Old days are pruned.
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { databaseFiles } from '@/lib/db';
import { jobTimeZone, localDayAndHour, type DailyJob, type JobResult } from '@/modules/jobs/runner';

const DEFAULT_KEEP_DAYS = 14;
const DAY_FOLDER = /^\d{4}-\d{2}-\d{2}$/;

export function backupDir(files = databaseFiles()): string {
  const configured = process.env.BACKUP_DIR?.trim();
  if (configured) return path.resolve(configured);
  const anchor = files[0]?.path ?? path.join(process.cwd(), 'seo-playground.db');
  return path.join(path.dirname(anchor), 'backups');
}

export function keepDays(): number {
  const value = Number.parseInt(process.env.BACKUP_KEEP_DAYS ?? '', 10);
  return Number.isFinite(value) && value >= 1 ? Math.min(value, 365) : DEFAULT_KEEP_DAYS;
}

/** Day folders older than the retention window, oldest first. `today` is YYYY-MM-DD. */
export function foldersToPrune(folders: string[], today: string, keep: number): string[] {
  const days = folders.filter((name) => DAY_FOLDER.test(name)).sort();
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (keep - 1));
  const limit = cutoff.toISOString().slice(0, 10);
  return days.filter((day) => day < limit);
}

export async function runBackup(today: string): Promise<JobResult> {
  const files = databaseFiles();
  if (files.length === 0) return { ok: false, message: 'Nenhum banco encontrado.' };
  const root = backupDir(files);
  const target = path.join(root, today);
  fs.mkdirSync(target, { recursive: true });

  let bytes = 0;
  for (const file of files) {
    const destination = path.join(target, `${file.label}.db`);
    const source = new Database(file.path, { readonly: true, fileMustExist: true });
    try {
      await source.backup(destination);
    } finally {
      source.close();
    }
    bytes += fs.statSync(destination).size;
  }

  const pruned = foldersToPrune(fs.readdirSync(root), today, keepDays());
  for (const day of pruned) fs.rmSync(path.join(root, day), { recursive: true, force: true });

  const size = (bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return { ok: true, message: `${files.length} arquivos, ${size} MB em ${target}${pruned.length ? `; ${pruned.length} dia(s) antigo(s) removido(s)` : ''}.` };
}

export const backupJob: DailyJob = {
  id: 'backup',
  label: 'Backup do banco',
  hour: 3,
  run: (now) => runBackup(localDayAndHour(now, jobTimeZone()).day),
};
