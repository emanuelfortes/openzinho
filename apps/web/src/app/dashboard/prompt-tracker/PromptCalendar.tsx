import StatusDot from './StatusDot';
import { calendarWeeks } from '@/lib/prompt-report';
import type { PromptCheck } from '@/lib/db';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Calendar of mentions: one row per week, one cell per day with the status dot and the day number. */
export default function PromptCalendar({ checks }: { checks: PromptCheck[] }) {
  const weeks = calendarWeeks(checks);
  if (weeks.length === 0) return <p className="text-sm text-nexo-faint">No checks yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-1">
        <thead>
          <tr className="nexo-label">
            <th className="px-2 text-left font-medium">Week of</th>
            {WEEKDAYS.map((d) => <th key={d} className="px-1 font-medium">{d}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.monday}>
              <td className="px-2 whitespace-nowrap font-mono text-[11px] text-nexo-dim">{week.monday}</td>
              {week.days.map((day) => (
                <td key={day.date} className="p-0">
                  {day.inRange ? (
                    <div className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-nexo bg-white/[0.02]">
                      <StatusDot status={day.status} size="sm" title={`${day.date}: ${day.status ?? 'no check'}`} />
                      <span className="text-[10px] font-semibold tabular-nums text-nexo-dim">{Number(day.date.slice(8))}</span>
                    </div>
                  ) : (
                    <div className="h-12 w-12" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
