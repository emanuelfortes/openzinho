import { formatBrl, type BudgetStatus } from './budget-shared';

const fieldCls = 'nexo-input min-w-0 w-full px-4 py-3 text-sm outline-none focus:border-nexo-sky';

const money = (value: number | null) => (value === null ? '' : value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Meter({ label, spent, cap }: { label: string; spent: number; cap: number | null }) {
  const ratio = cap ? Math.min(spent / cap, 1) : 0;
  const tone = cap && spent >= cap ? 'bg-nexo-danger' : cap && ratio >= 0.8 ? 'bg-nexo-warn' : 'bg-nexo-ice';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-nexo-dim">{label}</span>
        <span className="font-mono text-nexo-ice">{formatBrl(spent)}{cap ? ` de ${formatBrl(cap)}` : ' · sem teto'}</span>
      </div>
      {cap && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-nexo-surface-2">
          <div className={`h-full ${tone}`} style={{ width: `${Math.max(ratio * 100, 2)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Exchange rate and monthly caps; part of the Settings form. */
export default function BudgetFields({ projectName, status, explicitClientCapBrl }: { projectName: string; status: BudgetStatus; explicitClientCapBrl: number | null }) {
  // Without a cap set by hand, the plan default applies; show it as a hint, never save it as the field value.
  const capHint = explicitClientCapBrl === null && status.clientCapBrl !== null ? `Padrão do plano: ${formatBrl(status.clientCapBrl)}` : 'Sem teto';
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-2">
          <span className="nexo-label block">Cotação (R$ por US$)</span>
          <input name="budget_brl_per_usd" inputMode="decimal" defaultValue={money(status.brlPerUsd)} placeholder="5,60" className={fieldCls} />
        </label>
        <label className="space-y-2">
          <span className="nexo-label block">Teto deste cliente (R$/mês)</span>
          <input name="budget_client_cap" inputMode="decimal" defaultValue={money(explicitClientCapBrl)} placeholder={capHint} className={fieldCls} />
        </label>
        <label className="space-y-2">
          <span className="nexo-label block">Teto de todos (R$/mês)</span>
          <input name="budget_global_cap" inputMode="decimal" defaultValue={money(status.globalCapBrl)} placeholder="Sem teto" className={fieldCls} />
        </label>
      </div>
      <div className="space-y-3 rounded-nexo-lg border border-nexo-border bg-nexo-surface-2 p-4">
        <Meter label={`${projectName} em ${status.monthLabel}`} spent={status.clientSpentBrl} cap={status.clientCapBrl} />
        <Meter label="Todos os clientes" spent={status.globalSpentBrl} cap={status.globalCapBrl} />
      </div>
      <p className="text-xs leading-relaxed text-nexo-faint">
        O gasto é o que a DataForSEO cobrou no mês em todas as ferramentas, convertido pela cotação. Ao atingir um teto, as varreduras da grade, o Rank Tracker e o Prompt Tracker agendados param até o mês seguinte, e a grade não roda manualmente. A partir de 80% aparece um aviso. O teto é uma regra do Nexo, não um limite cobrado pela DataForSEO.
      </p>
    </div>
  );
}
