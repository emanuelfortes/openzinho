import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CircleHelp, Info } from 'lucide-react';
import { getSpendByTool, getSpendByDay, getFirstSpendTs } from '@/lib/db';
import {
  SPEND_PRESETS, resolveSpendRange, bucketSpend, totalSpend, estimateToolCost, formatUsd,
  type SpendBucket,
} from '@/lib/spend';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

interface SearchParams {
  from?: string;
  to?: string;
  preset?: string;
}

function formatDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SpendChart({ buckets, unit }: { buckets: SpendBucket[]; unit: 'day' | 'month' }) {
  const max = Math.max(...buckets.map((b) => b.knownCost), 0);
  // Label roughly 6 evenly spaced buckets so labels never collide
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));

  return (
    <div>
      <div className="flex gap-3">
        {/* Y axis: just the top value and zero, grid stays recessive */}
        <div className="flex flex-col justify-between h-48 text-[10px] font-mono text-nexo-faint text-right shrink-0 w-14 -mt-1.5 pb-0">
          <span>{formatUsd(max)}</span>
          <span>US$ 0</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="relative h-48 border-b border-nexo-border">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-nexo-border" />
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {buckets.map((b, i) => {
                const pct = max > 0 ? (b.knownCost / max) * 100 : 0;
                const align = i < buckets.length / 4 ? 'left-0' : i > (buckets.length * 3) / 4 ? 'right-0' : 'left-1/2 -translate-x-1/2';
                const label = `${b.label}: ${formatUsd(b.knownCost)} conhecido, ${b.calls} ${b.calls === 1 ? 'chamada' : 'chamadas'}${b.unknownCalls ? `, ${b.unknownCalls} com custo desconhecido` : ''}`;
                return (
                  <div key={b.key} tabIndex={0} aria-label={label}
                    className="group relative flex-1 h-full flex items-end outline-none">
                    <div
                      className="w-full rounded-t-[4px] bg-nexo-blue group-hover:bg-nexo-sky group-focus:bg-nexo-sky transition-colors"
                      style={{ height: b.knownCost > 0 ? `max(${pct}%, 2px)` : '0' }}
                    />
                    <div style={{ bottom: `calc(${pct}% + 8px)` }} className={`pointer-events-none absolute ${align} z-10 hidden group-hover:block group-focus:block whitespace-nowrap rounded-nexo bg-nexo-surface-2 px-3 py-2 `}>
                      <p className="text-sm font-medium text-white font-mono">{formatUsd(b.knownCost)}</p>
                      <p className="text-[10px] text-nexo-faint">{b.label} · {b.calls} {b.calls === 1 ? 'chamada' : 'chamadas'}</p>
                      {b.unknownCalls > 0 && (
                        <p className="text-[10px] text-nexo-warn-text">+ {b.unknownCalls} {b.unknownCalls === 1 ? 'chamada' : 'chamadas'} com custo desconhecido</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Unknown-cost markers sit under their bucket */}
          <div className="flex gap-[2px] h-3 items-center">
            {buckets.map((b) => (
              <div key={b.key} className="flex-1 flex justify-center">
                {b.unknownCalls > 0 && <span className="w-1.5 h-1.5 rounded-full bg-white/30" />}
              </div>
            ))}
          </div>
          <div className="flex gap-[2px] text-[10px] text-nexo-faint">
            {buckets.map((b, i) => (
              <div key={b.key} className="flex-1 min-w-0 relative h-4">
                {i % labelEvery === 0 && <span className="absolute left-0 whitespace-nowrap">{b.label}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-4 text-[11px] text-nexo-faint">
        <span>Custo conhecido por {unit === 'day' ? 'dia' : 'mês'}</span>
        {buckets.some((b) => b.unknownCalls > 0) && (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            Inclui chamadas com custo desconhecido
          </span>
        )}
      </div>
    </div>
  );
}

async function SpendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const firstTs = getFirstSpendTs();
  const range = resolveSpendRange(params, new Date(), firstTs);
  const tools = getSpendByTool(range.fromMs, range.toMs);
  const { unit, buckets } = bucketSpend(getSpendByDay(range.fromMs, range.toMs), range.from, range.to);
  const totals = totalSpend(tools);
  const hasUnknown = totals.unknownCalls > 0;

  const tableRows = tools.map((t) => {
    const est = estimateToolCost(t);
    return {
      tool: t.tool,
      calls: t.calls,
      known_cost: Number(t.knownCost.toFixed(6)),
      unknown_cost_calls: t.unknownCalls,
      avg_cost_per_call: t.avgKnownCost !== null ? Number(t.avgKnownCost.toFixed(6)) : '',
      estimated_total: est !== null ? Number(est.toFixed(6)) : '',
    };
  });
  const columns = [
    { key: 'tool', label: 'Ferramenta' },
    { key: 'calls', label: 'Chamadas' },
    { key: 'known_cost', label: 'Custo conhecido (US$)' },
    { key: 'unknown_cost_calls', label: 'Chamadas com custo desconhecido' },
    { key: 'avg_cost_per_call', label: 'Custo médio por chamada (US$)' },
    { key: 'estimated_total', label: 'Total estimado (US$)' },
  ];

  const pill = (active: boolean) =>
    `px-3 py-1.5 rounded-nexo text-xs font-medium transition-colors ${active
      ? 'bg-nexo-surface-2 text-white'
      : 'bg-nexo-surface border border-nexo-border text-nexo-dim hover:text-white hover:border-nexo-border'}`;
  const dateInput = 'nexo-input min-w-0 w-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-nexo-sky [color-scheme:light]';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Gastos</h1>
        <p className="text-sm text-nexo-faint mt-1">Quanto custam suas chamadas ao DataForSEO, por ferramenta, com base no custo salvo em cada busca.</p>
      </div>

      {/* Date range: presets first, custom range after */}
      <div className="flex flex-wrap items-center gap-2">
        {SPEND_PRESETS.map((p) => (
          <Link key={p.key} href={`/dashboard/spending?preset=${p.key}`} className={pill(range.preset === p.key)}>
            {p.label}
          </Link>
        ))}
        <form method="get" action="/dashboard/spending" className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <label className="sr-only" htmlFor="spend-from">De</label>
          <input id="spend-from" type="date" name="from" defaultValue={range.from} required className={dateInput} />
          <span className="text-xs text-nexo-faint">até</span>
          <label className="sr-only" htmlFor="spend-to">Até</label>
          <input id="spend-to" type="date" name="to" defaultValue={range.to} required className={dateInput} />
          <button type="submit" className="px-3 py-1.5 rounded-nexo bg-nexo-blue text-white text-xs font-medium uppercase tracking-widest hover:bg-nexo-sky transition-colors">
            Aplicar
          </button>
        </form>
      </div>
      <p className="text-xs text-nexo-faint -mt-3">
        {formatDay(range.from)} – {formatDay(range.to)}
      </p>

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
          <p className="nexo-label">{hasUnknown ? 'Gasto conhecido' : 'Gasto'}</p>
          <p className="text-3xl font-medium text-nexo-text tracking-tight mt-1 font-mono">{formatUsd(totals.knownCost)}</p>
          <p className="text-[11px] text-nexo-faint mt-1">
            {hasUnknown ? 'No mínimo este valor — exclui chamadas com custo desconhecido' : 'Toda chamada neste período tem custo registrado'}
          </p>
        </div>
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
          <p className="nexo-label">Chamadas</p>
          <p className="text-3xl font-medium text-nexo-text tracking-tight mt-1 font-mono">{totals.calls.toLocaleString('pt-BR')}</p>
          <p className="text-[11px] text-nexo-faint mt-1">
            {hasUnknown
              ? `${totals.unknownCalls.toLocaleString('pt-BR')} com custo desconhecido`
              : totals.calls > 0 ? `${formatUsd(totals.knownCost / totals.calls)} em média` : 'Nenhuma chamada neste período'}
          </p>
        </div>
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
          <p className="nexo-label">Total estimado</p>
          <p className="text-3xl font-medium text-nexo-text tracking-tight mt-1 font-mono">
            {hasUnknown ? `~${formatUsd(totals.estimatedCost)}` : formatUsd(totals.knownCost)}
          </p>
          <p className="text-[11px] text-nexo-faint mt-1">
            {!hasUnknown
              ? 'Igual ao gasto — nada a estimar'
              : totals.unestimableCalls > 0
                ? `Chamadas desconhecidas precificadas pela média da ferramenta; ${totals.unestimableCalls} não puderam ser precificadas`
                : 'Chamadas desconhecidas precificadas pelo custo médio da ferramenta'}
          </p>
        </div>
      </div>

      {hasUnknown && (
        <div className="flex gap-3 bg-nexo-warn/10 border border-nexo-warn/40 rounded-nexo-lg px-4 py-3">
          <CircleHelp className="h-4 w-4 text-nexo-warn-text shrink-0 mt-0.5" />
          <p className="text-xs text-nexo-warn-text leading-relaxed">
            {totals.unknownCalls.toLocaleString('pt-BR')} {totals.unknownCalls !== 1 ? 'chamadas' : 'chamada'} neste período {totals.unknownCalls !== 1 ? 'não têm' : 'não tem'} custo registrado,
            geralmente porque {totals.unknownCalls !== 1 ? 'foram feitas' : 'foi feita'} antes de a ferramenta começar a salvar custos. Elas contam como chamadas, mas não somam nada ao gasto conhecido.
            A estimativa as precifica pelo custo médio conhecido da ferramenta, que pode diferir do que o DataForSEO realmente cobrou.
          </p>
        </div>
      )}

      {tools.length === 0 ? (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-6 py-12 text-center">
          <p className="text-sm text-nexo-dim">Nenhuma chamada ao DataForSEO registrada entre {formatDay(range.from)} e {formatDay(range.to)}.</p>
          {firstTs !== null && range.preset !== 'all' && (
            <Link href="/dashboard/spending?preset=all" className="inline-block mt-3 text-xs font-medium text-nexo-sky hover:underline">
              Mostrar todo o período
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6">
            <h2 className="nexo-label mb-6">Gasto ao longo do tempo</h2>
            <SpendChart buckets={buckets} unit={unit} />
          </div>

          <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between gap-3">
              <h2 className="nexo-label">Por ferramenta</h2>
              <div className="flex items-center gap-2">
                <CopyMarkdownButton data={tableRows} columns={columns} />
                <ExportCSVButton data={tableRows} columns={columns} filename={`spending-${range.from}-to-${range.to}.csv`} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="nexo-label border-b border-nexo-border">
                    <th className="text-left px-6 py-3">Ferramenta</th>
                    <th className="text-right px-4 py-3">Chamadas</th>
                    <th className="text-right px-4 py-3">Custo conhecido</th>
                    <th className="text-left px-4 py-3 w-40">Participação</th>
                    <th className="text-right px-4 py-3">Custo desconhecido</th>
                    <th className="text-right px-4 py-3">Média / chamada</th>
                    <th className="text-right px-6 py-3">Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-nexo-border">
                  {tools.map((t) => {
                    const share = totals.knownCost > 0 ? (t.knownCost / totals.knownCost) * 100 : 0;
                    const est = estimateToolCost(t);
                    return (
                      <tr key={t.tool} className="hover:bg-white/[0.04] transition-colors">
                        <td className="px-6 py-3 font-medium text-nexo-text whitespace-nowrap">
                          {t.href
                            ? <Link href={t.href} className="hover:text-nexo-sky hover:underline">{t.tool}</Link>
                            : t.tool}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-nexo-dim">{t.calls.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-nexo-text">
                          {t.unknownCalls === t.calls ? <span className="font-normal text-nexo-faint">desconhecido</span> : formatUsd(t.knownCost)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-nexo-surface-2 overflow-hidden">
                              <div className="h-full rounded-full bg-nexo-blue" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-nexo-faint w-9 text-right">{share.toFixed(share > 0 && share < 1 ? 1 : 0).replace('.', ',')}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-nexo-faint">
                          {t.unknownCalls > 0
                            ? <span className="text-nexo-warn-text">{t.unknownCalls} {t.unknownCalls === 1 ? 'chamada' : 'chamadas'}</span>
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-nexo-dim">
                          {t.avgKnownCost !== null ? formatUsd(t.avgKnownCost) : '—'}
                        </td>
                        <td className="px-6 py-3 text-right font-mono text-nexo-dim whitespace-nowrap">
                          {t.unknownCalls === 0 ? '—' : est !== null ? `~${formatUsd(est)}` : <span title="Esta ferramenta nunca registrou custo, então não há média para estimar">sem estimativa</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-3 rounded-nexo-lg border border-nexo-border px-4 py-3">
        <Info className="h-4 w-4 text-nexo-faint shrink-0 mt-0.5" />
        <div className="text-xs text-nexo-dim leading-relaxed space-y-1">
          <p>
            Os totais vêm das buscas salvas neste app, então podem ser menores que a variação do seu saldo no DataForSEO.
            Não entram na conta: Análise de conteúdo (não salva o custo), buscas que falharam ou não retornaram resultados e não foram salvas,
            e palavras-chave excluídas do Rank Tracker. Quando a mesma busca é feita de novo, ou uma palavra-chave é verificada duas vezes no mesmo dia,
            só o custo mais recente é mantido.
          </p>
          <p>Os dias seguem o fuso horário local deste servidor.</p>
        </div>
      </div>
    </div>
  );
}

export default withProjectScope(SpendingPage);
