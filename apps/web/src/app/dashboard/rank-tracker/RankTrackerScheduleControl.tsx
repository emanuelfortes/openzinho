'use client';

import { useEffect, useState } from 'react';
import PendingButton from '@/components/PendingButton';
import type { RankTrackerSchedule } from '@/lib/db';

export default function RankTrackerScheduleControl({
  schedule,
  saveAction,
}: {
  schedule: RankTrackerSchedule | null;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(Boolean(schedule));
  const [timeZone, setTimeZone] = useState(schedule?.timeZone ?? 'UTC');

  useEffect(() => {
    if (!schedule) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [schedule]);

  const nextRun = schedule
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: schedule.timeZone }).format(new Date(schedule.nextRunAt))
    : null;

  return (
    <form action={saveAction} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-nexo-border pb-4">
      <div className="mr-auto">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${enabled ? 'bg-nexo-ice' : 'bg-white/20'}`} aria-hidden="true" />
          <span className="nexo-label">Daily tracking</span>
        </div>
        <p className="mt-0.5 text-[10px] font-medium text-nexo-faint">
          {nextRun ? `Next Standard batch: ${nextRun}` : 'Enable a daily Standard batch for this project.'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-[10px] font-medium text-nexo-dim">
        <input name="enabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-3.5 w-3.5 rounded border-nexo-border text-nexo-sky focus:ring-nexo-sky" />
        Enabled
      </label>
      <input name="time_of_day" type="time" defaultValue={schedule?.timeOfDay ?? '08:00'} disabled={!enabled} className="nexo-input min-w-0 w-full px-2.5 py-1.5 text-xs font-medium outline-none disabled:opacity-40" />
      <input type="hidden" name="time_zone" value={timeZone} />
      <span className="max-w-32 truncate text-[10px] font-medium text-nexo-faint" title={timeZone}>{timeZone.replace(/_/g, ' ')}</span>
      <PendingButton
        type="submit"
        className="rounded-nexo bg-nexo-surface-2 px-3 py-1.5 text-[9px] font-medium uppercase tracking-widest text-nexo-dim transition-colors hover:bg-white/[0.04]"
        pendingClassName="rounded-nexo bg-nexo-surface-2 px-3 py-1.5 text-[9px] font-medium uppercase tracking-widest text-nexo-faint "
        pendingChildren="Saving…"
      >
        Save schedule
      </PendingButton>
    </form>
  );
}
