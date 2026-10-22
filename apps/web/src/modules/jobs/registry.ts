// Every daily job the worker runs. Add new jobs here.
import { backupJob } from '@/modules/backup/backup';
import { monthlyReportJob } from '@/modules/relatorio/monthly-job';
import { reviewsJob } from '@/modules/avaliacoes/job';
import type { DailyJob } from './runner';

export const DAILY_JOBS: DailyJob[] = [backupJob, reviewsJob, monthlyReportJob];
