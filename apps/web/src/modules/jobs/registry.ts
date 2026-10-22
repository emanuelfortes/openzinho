// Every daily job the worker runs. Add new jobs here.
import { backupJob } from '@/modules/backup/backup';
import type { DailyJob } from './runner';

export const DAILY_JOBS: DailyJob[] = [backupJob];
