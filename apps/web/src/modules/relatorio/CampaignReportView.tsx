import type { ReactNode } from 'react';
import { RANK_TIER_ORDER, RANK_TIERS } from '@/lib/rank-scale';
import { fmt, signed, type CampaignReport, type KeywordReport, type MetricDelta, type RunSummary } from './analysis';
import { monthLabel } from './months';
import ReportGrid from './ReportGrid';

function formatDay(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone }).format(new Date(ts));
}

/** Improvements in ice, losses in the warning tone. */
function DeltaText({ value, unit = '', lowerIsBetter = false }: { value: number | null | undefined; unit?: string; lowerIsBetter?: boolean }) {
  if (value == null) return <span className="text-nexo-faint">—</span>;
  const better = lowerIsBetter ? value < 0 : value > 0;
  const worse = lowerIsBetter ? value > 0 : value < 0;
  return <span className={better ? 'text-nexo-ice' : worse ? 'text-nexo-warn-text' : 'text-nexo-dim'}>{signed(value)}{unit}</span>;
}

function MetricsTable({ current, previous, delta, monthName, previousName }: { current: RunSummary | null; previous: RunSummary | null; delta: MetricDelta | null; monthName: string; previousName: string }) {
  const rows: Array<{ label: string; now: string; before: string; delta: ReactNode }> = [
    {
      label: 'Posição média',
      now: current?.avgPosition != null ? fmt(current.avgPosition) : '—',
      before: previous?.avgPosition != null ? fmt(previous.avgPosition) : '—',
      delta: <DeltaText value={delta?.avgPosition} lowerIsBetter />,
    },
    { label: 'Share of Voice', now: current ? `${fmt(current.shareOfVoice)}%` : '—', before: previous ? `${fmt(previous.shareOfVoice)}%` : '—', delta: <DeltaText value={delta?.shareOfVoice} unit=" p.p." /> },
    { label: 'Top 3', now: current ? `${fmt(current.top3Pct)}% (${current.top3Points}/${current.activePoints})` : '—', before: previous ? `${fmt(previous.top3Pct)}% (${previous.top3Points}/${previous.activePoints})` : '—', delta: <DeltaText value={delta?.top3Pct} unit=" p.p." /> },
    { label: 'Top 10', now: current ? `${fmt(current.top10Pct)}% (${current.top10Points}/${current.activePoints})` : '—', before: previous ? `${fmt(previous.top10Pct)}% (${previous.top10Points}/${previous.activePoints})` : '—', delta: <DeltaText value={delta?.top10Pct} unit=" p.p." /> },
  ];
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="nexo-label border-b border-nexo-border">
          <th className="py-2 pr-3 font-normal">Métrica medida</th>
          <th className="py-2 pr-3 text-right font-normal">{previousName}</th>
          <th className="py-2 pr-3 text-right font-normal">{monthName}</th>
          <th className="py-2 text-right font-normal">Variação</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-b border-nexo-border last:border-0">
            <td className="py-2 pr-3 text-nexo-dim">{row.label}</td>
            <td className="py-2 pr-3 text-right tabular-nums text-nexo-dim">{row.before}</td>
            <td className="py-2 pr-3 text-right font-medium tabular-nums text-nexo-text">{row.now}</td>
            <td className="py-2 text-right tabular-nums">{row.delta}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bullets({ title, hint, items, prefix }: { title: string; hint: string; items: string[]; prefix?: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="nexo-section">{title}</p>
      <p className="mt-0.5 text-[11px] text-nexo-faint">{hint}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-nexo-dim">
        {items.map((item) => (
          <li key={item} className="border-l border-nexo-border-strong pl-3">
            {prefix && <b className="font-medium text-nexo-text">{prefix}: </b>}{item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeywordSection({ keyword, report, timeZone }: { keyword: KeywordReport; report: CampaignReport; timeZone: string }) {
  const previousName = monthLabel(report.previousMonth);
  const currentName = monthLabel(report.month);
  return (
    <section className="nexo-panel space-y-5 p-5">
      <div>
        <h2 className="text-base font-medium text-nexo-text">{keyword.keyword}</h2>
        <p className="mt-0.5 text-[11px] text-nexo-faint">
          {keyword.gridSize}×{keyword.gridSize} pontos
          {keyword.inactive.length > 0 && <> · {keyword.inactive.length} desligados (fora das contas)</>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {([['Mês anterior', previousName, keyword.previous], ['Mês do relatório', currentName, keyword.current]] as const).map(([kind, name, run]) => (
          <figure key={kind} className="space-y-2">
            <figcaption className="flex items-baseline justify-between gap-2">
              <span className="nexo-label">{kind} · {name}</span>
              <span className="text-[11px] text-nexo-faint">{run ? `varredura de ${formatDay(run.ts, timeZone)}` : 'sem varredura concluída'}</span>
            </figcaption>
            <ReportGrid points={run?.points ?? null} gridSize={keyword.gridSize} label={`Grade de ${keyword.keyword} em ${name}`} />
          </figure>
        ))}
      </div>

      <MetricsTable current={keyword.current} previous={keyword.previous} delta={keyword.delta} monthName={currentName} previousName={previousName} />

      {keyword.sectors.length > 0 && (
        <div className="overflow-x-auto">
          <p className="nexo-label mb-1">Posição média por setor (medida)</p>
          <div className="flex min-w-[480px] gap-1.5">
            {keyword.sectors.map((sector) => (
              <div key={sector.sector} className="flex-1 rounded-nexo bg-nexo-surface-2 px-2 py-1.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-nexo-faint">{sector.sector}</p>
                <p className="text-sm font-light tabular-nums text-nexo-text">{fmt(sector.avgPosition)}</p>
                <p className="text-[10px] tabular-nums">
                  {sector.previousAvgPosition !== null ? <DeltaText value={Math.round((sector.avgPosition - sector.previousAvgPosition) * 10) / 10} lowerIsBetter /> : <span className="text-nexo-faint">—</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {keyword.competitors.length > 0 && (
        <div className="overflow-x-auto">
          <p className="nexo-label mb-1">Concorrentes mais presentes no top 3 (medido)</p>
          <table className="w-full min-w-[420px] text-left text-xs">
            <tbody>
              {keyword.competitors.map((competitor) => (
                <tr key={competitor.name} className="border-b border-nexo-border last:border-0">
                  <td className="py-1.5 pr-3 text-nexo-text">{competitor.name}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-nexo-dim">top 3 em {competitor.top3Points}/{keyword.current?.activePoints ?? 0}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-nexo-faint">{competitor.previousTop3Points === null ? 'sem comparação' : `antes ${competitor.previousTop3Points}`}</td>
                  <td className="py-1.5 text-right tabular-nums text-nexo-faint">média #{fmt(competitor.avgRank)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Bullets title="Fatos medidos" hint="Calculados nas varreduras acima, com os pontos ativos como base." items={keyword.facts} />
          <Bullets title="Dados ausentes" hint="O que não sabemos porque falta varredura. Nada foi estimado no lugar." items={keyword.missing} />
        </div>
        <div className="space-y-5">
          <Bullets title="Hipóteses" hint="Explicações possíveis geradas por regras. Precisam ser verificadas antes de virar conclusão." items={keyword.hypotheses} prefix="Hipótese" />
          <Bullets title="Recomendações" hint="Próximos passos propostos; não são ações já feitas." items={keyword.recommendations} prefix="Recomendação" />
        </div>
      </div>
    </section>
  );
}

export default function CampaignReportView({ report, timeZone, monthOptions, actions }: {
  report: CampaignReport;
  timeZone: string;
  /** Months offered in the selector (GET ?mes=), newest first. */
  monthOptions: string[];
  /** Buttons shown next to the selector (PDF, share link). */
  actions?: ReactNode;
}) {
  const { summary } = report;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex items-end gap-2">
          <label className="block">
            <span className="nexo-label">Mês do relatório</span>
            <select name="mes" defaultValue={report.month} className="nexo-input mt-1 block px-3 py-2 text-sm">
              {monthOptions.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
            </select>
          </label>
          <button type="submit" className="nexo-btn-ghost px-3 py-2.5">Ver</button>
        </form>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      <section className="nexo-panel grid gap-4 p-5 sm:grid-cols-4">
        <div>
          <p className="nexo-label">Posição média</p>
          <p className="nexo-metric mt-1 text-3xl tabular-nums">{summary.avgPosition != null ? fmt(summary.avgPosition) : '—'}</p>
          <p className="mt-0.5 text-[11px]"><DeltaText value={summary.avgPositionDelta} lowerIsBetter /> <span className="text-nexo-faint">vs. {report.previousMonthLabel}</span></p>
        </div>
        <div>
          <p className="nexo-label">Share of Voice</p>
          <p className="nexo-metric mt-1 text-3xl tabular-nums">{summary.shareOfVoice != null ? `${fmt(summary.shareOfVoice)}%` : '—'}</p>
          <p className="mt-0.5 text-[11px]"><DeltaText value={summary.shareOfVoiceDelta} unit=" p.p." /> <span className="text-nexo-faint">vs. {report.previousMonthLabel}</span></p>
        </div>
        <div>
          <p className="nexo-label">Com varredura no mês</p>
          <p className="nexo-metric mt-1 text-3xl tabular-nums">{summary.withCurrent}/{summary.keywordCount}</p>
          <p className="mt-0.5 text-[11px] text-nexo-faint">palavras-chave · {summary.compared} comparáveis</p>
        </div>
        <div className="text-[11px] leading-relaxed text-nexo-dim">
          <p className="nexo-label">Movimento</p>
          <p className="mt-1">Subiram: {summary.improved.length ? summary.improved.join(', ') : '—'}</p>
          <p>Caíram: {summary.worsened.length ? summary.worsened.join(', ') : '—'}</p>
        </div>
        <p className="text-[11px] text-nexo-faint sm:col-span-4">
          Compara a última varredura concluída de {report.monthLabel} com a última de {report.previousMonthLabel}, por palavra-chave. Ausente do top 20 conta como posição 21. Pontos desligados ficam fora das contas.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-nexo-faint">
        {RANK_TIER_ORDER.map((tier) => (
          <span key={tier} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: RANK_TIERS[tier].swatch }} />
            {RANK_TIERS[tier].label}
          </span>
        ))}
        <span>· Norte para cima · quadrado tracejado = centro</span>
      </div>

      {report.keywords.map((keyword) => <KeywordSection key={keyword.keyword} keyword={keyword} report={report} timeZone={timeZone} />)}
    </div>
  );
}
