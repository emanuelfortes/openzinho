// Daily background jobs (backups, review alerts, monthly reports). The worker calls
// /api/cron/jobs every minute; each job runs at most once per local day, from its hour on.
import { getSetting, setSetting } from '@/lib/db';

export interface JobResult {
  ok: boolean;
  message: string;
}

export interface DailyJob {
  id: string;
  /** Shown in Configurações. */
  label: string;
  /** Local hour (0-23) from which the job may run each day. */
  hour: number;
  run: (now: Date) => Promise<JobResult>;
}

export interface JobState {
  day: string;
  at: number;
  ok: boolean;
  message: string;
}

const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export function jobTimeZone(): string {
  const zone = process.env.NEXO_TIME_ZONE?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** Calendar day (YYYY-MM-DD) and hour of `now` in the given time zone. */
export function localDayAndHour(now: Date, timeZone: string): { day: string; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const stateKey = (id: string) => `job:${id}`;

export function getJobState(id: string): JobState | null {
  const raw = getSetting(stateKey(id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JobState;
  } catch {
    return null;
  }
}

export function isJobDue(job: DailyJob, state: JobState | null, now: Date, timeZone = jobTimeZone()): boolean {
  const { day, hour } = localDayAndHour(now, timeZone);
  return hour >= job.hour && state?.day !== day;
}

/** Runs every due job one after another. A failing job is recorded and does not stop the others. */
export async function runDueJobs(jobs: DailyJob[], now = new Date()): Promise<Array<{ id: string } & JobResult>> {
  const timeZone = jobTimeZone();
  const ran: Array<{ id: string } & JobResult> = [];
  for (const job of jobs) {
    if (!isJobDue(job, getJobState(job.id), now, timeZone)) continue;
    let result: JobResult;
    try {
      result = await job.run(now);
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : 'Erro desconhecido.' };
    }
    const state: JobState = { day: localDayAndHour(now, timeZone).day, at: now.getTime(), ...result };
    setSetting(stateKey(job.id), JSON.stringify(state));
    ran.push({ id: job.id, ...result });
  }
  return ran;
}
