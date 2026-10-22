import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cron-auth';
import { DAILY_JOBS } from '@/modules/jobs/registry';
import { runDueJobs } from '@/modules/jobs/runner';

export const dynamic = 'force-dynamic';

// One pass at a time per process: a backup or a batch of e-mails can outlast the worker interval.
let passInProgress = false;

/** Called by the bundled worker every minute; runs the daily jobs that are due. POST only. */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (passInProgress) return NextResponse.json({ busy: true, ran: [] });
  passInProgress = true;
  try {
    return NextResponse.json({ ran: await runDueJobs(DAILY_JOBS) });
  } finally {
    passInProgress = false;
  }
}
