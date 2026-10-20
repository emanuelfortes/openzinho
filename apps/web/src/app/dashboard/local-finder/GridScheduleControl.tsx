'use client';

import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { GridSchedule, GridScheduleFrequency } from '@/lib/db';
import { updateGridSchedule } from '../geo-grid/actions';

const days = [
  ['Sunday', 0], ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4], ['Friday', 5], ['Saturday', 6],
] as const;

export default function GridScheduleControl({ runId, schedule }: { runId: string; schedule: GridSchedule | null }) {
  const [frequency, setFrequency] = useState<'off' | GridScheduleFrequency>(schedule?.frequency ?? 'off');
  const usesWeekday = frequency === 'weekly' || frequency === 'biweekly';
  const [timeZone, setTimeZone] = useState(schedule?.time_zone ?? 'UTC');

  useEffect(() => {
    if (!schedule) setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }, [schedule]);

  return (
    <form action={updateGridSchedule} className="border-t border-nexo-border pt-4">
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="time_zone" value={timeZone} />
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-2.5">
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-nexo bg-nexo-blue/10 text-nexo-sky">
            <CalendarClock className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-xs font-medium text-nexo-text">Automated checks</p>
            <p className="mt-0.5 max-w-sm text-[11px] leading-relaxed text-nexo-faint">A scheduler adds a new snapshot to this timeline at the selected time.</p>
          </div>
        </div>
        {schedule && (
          <span className="shrink-0 text-[10px] font-medium tabular-nums text-nexo-faint">
            Next {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: schedule.time_zone }).format(new Date(schedule.next_run_at))}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select name="frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as 'off' | GridScheduleFrequency)} className="nexo-input min-w-0 w-full px-2.5 py-2 text-xs font-semibold outline-none">
          <option value="off">Not scheduled</option>
          <option value="daily">Every day</option>
          <option value="weekly">Every week</option>
          <option value="biweekly">Every 2 weeks</option>
          <option value="monthly">Every month</option>
        </select>
        <input name="time_of_day" type="time" defaultValue={schedule?.time_of_day ?? '08:00'} disabled={frequency === 'off'} className="nexo-input min-w-0 w-full px-2.5 py-2 text-xs font-semibold outline-none disabled:opacity-40" />
        {frequency === 'monthly' ? (
          <select name="month_day" defaultValue={schedule?.month_day ?? 1} className="nexo-input min-w-0 w-full px-2.5 py-2 text-xs font-semibold outline-none">
            {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>Day {day}</option>)}
          </select>
        ) : (
          <select name="weekday" defaultValue={schedule?.weekday ?? 1} disabled={!usesWeekday} className="nexo-input min-w-0 w-full px-2.5 py-2 text-xs font-semibold outline-none disabled:opacity-40">
            {days.map(([label, value]) => <option key={value} value={value}>{label}</option>)}
          </select>
        )}
        <select name="queue_mode" defaultValue={schedule?.queue_mode ?? 'standard'} disabled={frequency === 'off'} className="nexo-input min-w-0 w-full px-2.5 py-2 text-xs font-semibold outline-none disabled:opacity-40">
          <option value="standard">Standard queue</option>
          <option value="priority">Priority queue</option>
        </select>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[10px] text-nexo-faint">{timeZone.replace(/_/g, ' ')} · Requires the configured cron endpoint.</p>
        <button type="submit" className="nexo-section transition-colors hover:text-white">
          {frequency === 'off' ? 'Save' : 'Save schedule'}
        </button>
      </div>
    </form>
  );
}
