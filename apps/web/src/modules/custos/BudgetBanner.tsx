import Link from 'next/link';
import { formatBrl } from './budget-shared';
import { getBudgetStatus, skippedRunsThisMonth } from './budget';

/** Shown under the header from 80% of a monthly cap, and while a cap is blocking runs. */
export default function BudgetBanner({ projectId }: { projectId: string }) {
  const status = getBudgetStatus(projectId);
  if (!status.blocked && !status.warning) return null;
  const skipped = skippedRunsThisMonth(projectId);

  const message = status.blocked
    ? `${status.reason} As varreduras agendadas estão pausadas até o mês seguinte${skipped > 0 ? ` (${skipped} ${skipped === 1 ? 'execução pulada' : 'execuções puladas'})` : ''}.`
    : status.clientCapBrl !== null && status.clientSpentBrl >= status.clientCapBrl * 0.8
      ? `Este cliente já gastou ${formatBrl(status.clientSpentBrl)} dos ${formatBrl(status.clientCapBrl)} do teto de ${status.monthLabel}.`
      : `Os clientes já gastaram ${formatBrl(status.globalSpentBrl)} dos ${formatBrl(status.globalCapBrl ?? 0)} do teto de ${status.monthLabel}.`;

  return (
    <div
      role={status.blocked ? 'alert' : 'status'}
      className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-2.5 text-xs ${
        status.blocked ? 'border-nexo-danger/40 bg-nexo-danger/10 text-nexo-danger-text' : 'border-nexo-warn/40 bg-nexo-warn/10 text-nexo-warn-text'
      }`}
    >
      <span>{message}</span>
      <Link href="/dashboard/settings" className="nexo-label shrink-0 text-current underline-offset-2 hover:underline">
        Ajustar teto
      </Link>
    </div>
  );
}
