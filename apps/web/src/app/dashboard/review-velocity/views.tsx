// Presentational server components for the three tabs. They only render props (no data access),
// so they are safe as child components of the project-scoped page.
import { AlertTriangle, Star } from 'lucide-react';
import {
  CRITERIA, CRITERION_GROUPS, formatCriterion, rankColor, rgbCss,
  type ComparisonReport, type CriterionId, type ListingResult,
} from '@/lib/review-report';
import type { BenchmarkListing, ReviewTask } from '@/lib/review-velocity-db';
import VelocityChart, { type ChartSeries } from './VelocityChart';
import { setSelfListingAction } from './actions';

const card = 'bg-nexo-surface rounded-nexo-lg border border-nexo-border';
const th = 'nexo-label px-3 py-2.5 whitespace-nowrap';
const td = 'px-3 py-2.5 text-sm tabular-nums text-nexo-dim whitespace-nowrap';

export function formatDay(ms: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(new Date(ms));
}

function SectionHeader({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b border-nexo-border flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="nexo-label">{title}</h2>
        {hint && <p className="text-[11px] text-nexo-faint mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function ListingName({ listing }: { listing: Pick<ListingResult, 'title' | 'isSelf' | 'partial'> }) {
  return (
    <span className="inline-flex items-center gap-1.5 max-w-[260px]">
      <span className={`truncate ${listing.isSelf ? 'font-medium text-nexo-text' : 'font-semibold text-nexo-text'}`}>{listing.title}</span>
      {listing.isSelf && <span className="shrink-0 text-[9px] font-medium uppercase tracking-widest text-nexo-sky bg-nexo-blue/10 px-1.5 py-0.5 rounded">Você</span>}
      {listing.partial && <span title="Os dados não chegam até o início do período" className="shrink-0 text-nexo-warn-text"><AlertTriangle className="w-3.5 h-3.5" /></span>}
    </span>
  );
}

function RankChip({ rank, count }: { rank: number | null; count: number }) {
  if (rank === null) return <span className="text-[10px] text-nexo-faint">n/d</span>;
  return (
    <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded-md text-[11px] font-medium text-white tabular-nums" style={{ background: rgbCss(rankColor(rank, count)) }}>
      {rank}
    </span>
  );
}

function Value({ listing, id }: { listing: ListingResult; id: CriterionId }) {
  const value = listing.metrics[id];
  return <span className={value === null ? 'text-nexo-faint' : ''}>{formatCriterion(id, value)}</span>;
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export function KpiStrip({ report }: { report: ComparisonReport }) {
  return (
    <div className={`${card} grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-nexo-border `}>
      {report.kpis.map((kpi) => (
        <div key={kpi.label} className="px-5 py-4">
          <p className="nexo-label">{kpi.label}</p>
          <p className="nexo-metric font-mono text-2xl tabular-nums mt-1">{kpi.value}</p>
          {kpi.detail && <p className="text-[11px] text-nexo-faint mt-0.5 truncate" title={kpi.detail}>{kpi.detail}</p>}
        </div>
      ))}
    </div>
  );
}

export function OverviewView({ report, series }: { report: ComparisonReport; series: ChartSeries[] }) {
  const n = report.listings.length;
  const completeWeeks = report.weeks.slice(0, -1);
  const heatMax = Math.max(1, ...report.listings.flatMap((l) => l.weekly.slice(0, -1).filter((v): v is number => v !== null)));
  return (
    <div className="space-y-6">
      <KpiStrip report={report} />

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Ritmo de avaliações" hint="Ordenado pela pontuação geral. Abra a aba Relatório para ver todos os critérios." />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/[0.02]">
              <tr className="text-left">
                <th className={th}>#</th><th className={th}>Perfil</th>
                <th className={`${th} text-right`}>Google</th>
                <th className={`${th} text-right`}>Por semana</th>
                <th className={`${th} text-right`}>Por mês</th>
                <th className={`${th} text-right`}>Tendência</th>
                <th className={`${th} text-right`}>Regularidade</th>
                <th className={`${th} text-right`}>Última avaliação</th>
                <th className={`${th} text-right`}>Taxa de resposta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexo-border">
              {report.listings.map((l) => (
                <tr key={l.id} className={l.isSelf ? 'bg-nexo-blue/10' : ''}>
                  <td className={td}><RankChip rank={l.overallRank} count={n} /></td>
                  <td className={td}><ListingName listing={l} /></td>
                  <td className={`${td} text-right`}>
                    {l.googleRating !== null ? <span className="font-semibold">{l.googleRating.toFixed(1).replace('.', ',')}★</span> : '—'}
                    <span className="text-nexo-faint"> · {l.googleTotal ?? '—'}</span>
                  </td>
                  <td className={`${td} text-right font-medium text-nexo-text `}><Value listing={l} id="perWeek4" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="perMonth" /></td>
                  <td className={`${td} text-right ${l.metrics.momentum !== null ? (l.metrics.momentum > 0 ? 'text-nexo-ice' : l.metrics.momentum < 0 ? 'text-nexo-danger-text' : '') : ''}`}><Value listing={l} id="momentum" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="regularity" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="freshness" /></td>
                  <td className={`${td} text-right`}><Value listing={l} id="replyRate" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Novas avaliações ao longo do tempo" />
        <div className="px-6 py-5">
          <VelocityChart weekLabels={completeWeeks.map((w) => w.label)} monthLabels={report.months.slice(0, -1).map((m) => m.label)} series={series} />
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Mapa de calor semanal" hint="Novas avaliações por semana ISO completa. Hachurado = sem dados." />
        <div className="overflow-x-auto px-6 py-5">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <th />
                {completeWeeks.map((w) => <th key={w.key} className="text-[9px] font-medium text-nexo-faint px-0.5 whitespace-nowrap">{w.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.listings.map((l) => (
                <tr key={l.id}>
                  <td className="pr-3 text-xs whitespace-nowrap"><ListingName listing={l} /></td>
                  {l.weekly.slice(0, -1).map((v, i) => (
                    <td key={completeWeeks[i].key} title={`${l.title} · semana de ${completeWeeks[i].label}: ${v ?? 'sem dados'}`}
                      className="w-9 h-8 rounded-md text-center text-[11px] font-medium tabular-nums"
                      style={v === null
                        ? { background: 'repeating-linear-gradient(45deg, rgba(77,162,255,.04), rgba(77,162,255,.04) 3px, rgba(77,162,255,.12) 3px, rgba(77,162,255,.12) 6px)' }
                        : { background: `rgba(31, 107, 255, ${v === 0 ? 0.06 : 0.15 + 0.85 * (v / heatMax)})`, color: v / heatMax > 0.5 ? '#ffffff' : '#c2e0ff' }}>
                      {v ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

export function ReportView({ report, context, exportBar }: { report: ComparisonReport; context: { keyword: string; area: string }; exportBar: React.ReactNode }) {
  const n = report.listings.length;
  const self = report.listings.find((l) => l.isSelf) ?? null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-nexo-border py-3">
        <p className="text-[11px] text-nexo-dim">
          <span className="nexo-label">Período</span>{' '}
          {formatDay(report.periodStart, report.timeZone)} – {formatDay(report.periodEnd, report.timeZone)} · {n} {n === 1 ? 'perfil' : 'perfis'} · {context.keyword}, {context.area}
        </p>
        <div className="flex items-center gap-4">{exportBar}</div>
      </div>

      <KpiStrip report={report} />

      <section className={`${card} p-6 space-y-5`}>
        <div className="space-y-1.5">
          {report.summary.headline.map((line) => <p key={line} className="text-base text-nexo-text leading-relaxed">{line}</p>)}
        </div>
        {report.summary.targets.length > 0 && (
          <div>
            <h3 className="nexo-label mb-2">Metas e lacunas</h3>
            <ul className="space-y-1.5">
              {report.summary.targets.map((t) => <li key={t} className="text-sm text-nexo-dim pl-4 relative before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:rounded-full before:bg-nexo-blue">{t}</li>)}
            </ul>
          </div>
        )}
        {self && (report.summary.strengths.length > 0 || report.summary.weaknesses.length > 0) && (
          <div className="grid sm:grid-cols-2 gap-6 pt-1">
            <div>
              <h3 className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice mb-2">Pontos fortes · terço superior</h3>
              {report.summary.strengths.length ? (
                <ul className="space-y-1">{report.summary.strengths.map((s) => <li key={s} className="text-sm text-nexo-dim">{s}</li>)}</ul>
              ) : <p className="text-sm text-nexo-faint">Nenhum ainda.</p>}
            </div>
            <div>
              <h3 className="text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text mb-2">Pontos fracos · terço inferior</h3>
              {report.summary.weaknesses.length ? (
                <ul className="space-y-1">{report.summary.weaknesses.map((s) => <li key={s} className="text-sm text-nexo-dim">{s}</li>)}</ul>
              ) : <p className="text-sm text-nexo-faint">Nenhum.</p>}
            </div>
          </div>
        )}
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Matriz de posições" hint="Posição em cada critério, 1 = melhor. Os critérios com peso compõem a pontuação geral." />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className={`${th} text-left sticky left-0 bg-white/[0.02] `} rowSpan={2}>Perfil</th>
                <th className={`${th} text-center`} rowSpan={2}>Geral</th>
                {CRITERION_GROUPS.map((g) => (
                  <th key={g} colSpan={CRITERIA.filter((c) => c.group === g).length} className={`${th} text-center border-l border-nexo-border `}>{g}</th>
                ))}
              </tr>
              <tr className="bg-white/[0.02]">
                {CRITERIA.map((c, i) => (
                  <th key={c.id} title={`${c.label}: ${c.description}${c.weight ? ` Peso ${c.weight}%.` : ''}`}
                    className={`text-[9px] leading-tight font-medium text-nexo-dim px-1 pb-2 text-center align-bottom min-w-9 ${i === 0 || CRITERIA[i - 1].group !== c.group ? 'border-l border-nexo-border' : ''}`}>
                    {c.short}{c.weight > 0 && <span className="text-nexo-sky">*</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-nexo-border">
              {report.listings.map((l) => (
                <tr key={l.id} className={l.isSelf ? 'bg-nexo-blue/10' : ''}>
                  <td className={`${td} sticky left-0 ${l.isSelf ? 'bg-nexo-blue/10' : 'bg-nexo-surface'}`}><ListingName listing={l} /></td>
                  <td className={`${td} text-center`}>
                    <span className="font-medium text-nexo-text">{l.score !== null ? Math.round(l.score) : '—'}</span>
                    <span className="text-[10px] text-nexo-faint"> · #{l.overallRank ?? '—'}</span>
                  </td>
                  {CRITERIA.map((c, i) => (
                    <td key={c.id} title={`${c.label}: ${formatCriterion(c.id, l.metrics[c.id])}`}
                      className={`px-1 py-2 text-center ${i === 0 || CRITERIA[i - 1].group !== c.group ? 'border-l border-nexo-border' : ''}`}>
                      <RankChip rank={l.ranks[c.id]} count={n} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-6 py-3 text-[11px] text-nexo-faint border-t border-nexo-border">
          <span className="text-nexo-sky">*</span> Na pontuação: {CRITERIA.filter((c) => c.weight > 0).map((c) => `${c.short} ${c.weight}%`).join(' · ')}. n/d = menos de 5 avaliações no período (3 avaliações negativas para respostas a negativas); o peso é redistribuído.
        </p>
      </section>

      {CRITERION_GROUPS.map((group) => {
        const criteria = CRITERIA.filter((c) => c.group === group);
        return (
          <section key={group} className={`${card} overflow-hidden`}>
            <SectionHeader title={group} />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className={`${th} text-left`}>Perfil</th>
                    {criteria.map((c) => <th key={c.id} className={`${th} text-right`} title={c.description}>{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-nexo-border">
                  {[...report.listings].sort((a, b) => (a.ranks[criteria[0].id] ?? Infinity) - (b.ranks[criteria[0].id] ?? Infinity)).map((l) => (
                    <tr key={l.id} className={l.isSelf ? 'bg-nexo-blue/10' : ''}>
                      <td className={td}><ListingName listing={l} /></td>
                      {criteria.map((c) => (
                        <td key={c.id} className={`${td} text-right`}>
                          <Value listing={l} id={c.id} />
                          {l.ranks[c.id] !== null && c.id !== 'mapsRank' && <span className={`ml-1.5 text-[10px] font-medium ${l.ranks[c.id] === 1 ? 'text-nexo-ice' : 'text-nexo-faint'}`}>#{l.ranks[c.id]}</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-6 py-2.5 text-[11px] text-nexo-faint border-t border-nexo-border">
              {criteria.map((c) => `${c.label}: ${c.description}`).join(' ')}
            </p>
          </section>
        );
      })}

      <section className="text-[11px] text-nexo-faint space-y-1 px-1">
        <p><span className="nexo-label">Método</span> Avaliações do Google via DataForSEO, coletadas das mais recentes para as mais antigas e datadas pela publicação. Semanas ISO (segunda a domingo) no fuso {report.timeZone}; a semana e o mês atuais ficam fora das médias.</p>
        <p>A taxa de resposta só conta avaliações com mais de 7 dias. Avaliações analisadas: {report.listings.map((l) => `${l.title} ${l.reviewsInPeriod}`).join(' · ')}.</p>
      </section>
    </div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

function coverageLabel(listing: BenchmarkListing, timeZone: string): string {
  if (listing.lastFetchAt === null) return 'Ainda não coletado';
  if (listing.coverage.complete) return 'Histórico completo';
  return listing.coverage.from !== null ? `Desde ${formatDay(listing.coverage.from, timeZone)}` : 'Desconhecido';
}

export function DataView({ benchmarkId, listings, tasks, report, timeZone }: {
  benchmarkId: string; listings: BenchmarkListing[]; tasks: ReviewTask[]; report: ComparisonReport | null; timeZone: string;
}) {
  const titles = new Map(listings.map((l) => [l.id, l.title]));
  const partial = new Set(report?.listings.filter((l) => l.partial).map((l) => l.id) ?? []);
  const inPeriod = new Map(report?.listings.map((l) => [l.id, l.reviewsInPeriod]) ?? []);
  const self = listings.find((l) => l.isSelf);
  const totalCost = tasks.reduce((sum, t) => sum + (t.cost ?? 0), 0);
  return (
    <div className="space-y-6">
      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Perfis">
          <form action={setSelfListingAction} className="flex items-center gap-2">
            <input type="hidden" name="id" value={benchmarkId} />
            <label htmlFor="rv-self" className="nexo-label inline-flex items-center gap-1"><Star className="w-3 h-3" /> Meu perfil</label>
            <select id="rv-self" name="listing_id" defaultValue={self ? String(self.id) : ''} className="nexo-input min-w-0 text-xs px-2 py-1.5 max-w-56">
              <option value="">Nenhum</option>
              {listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
            <button type="submit" className="nexo-section hover:text-white">Salvar</button>
          </form>
        </SectionHeader>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/[0.02]">
              <tr className="text-left">
                <th className={th}>Perfil</th><th className={th}>Endereço</th><th className={`${th} text-right`}>Posição no Maps</th>
                <th className={`${th} text-right`}>Google</th><th className={th}>Cobertura</th><th className={`${th} text-right`}>Avaliações no período</th><th className={th}>Última coleta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexo-border">
              {listings.map((l) => (
                <tr key={l.id} className={l.isSelf ? 'bg-nexo-blue/10' : ''}>
                  <td className={td}><ListingName listing={{ title: l.title, isSelf: l.isSelf, partial: partial.has(l.id) }} /></td>
                  <td className={`${td} text-xs text-nexo-dim max-w-64 truncate`} title={l.address ?? ''}>{l.address ?? '—'}</td>
                  <td className={`${td} text-right`}>{l.mapsRank ? `#${l.mapsRank}` : '—'}</td>
                  <td className={`${td} text-right`}>{l.rating !== null ? `${l.rating.toFixed(1).replace('.', ',')}★` : '—'} <span className="text-nexo-faint">· {l.totalReviews ?? '—'}</span></td>
                  <td className={`${td} ${partial.has(l.id) ? 'text-nexo-warn-text' : ''}`}>{coverageLabel(l, timeZone)}</td>
                  <td className={`${td} text-right`}>{inPeriod.get(l.id) ?? '—'}</td>
                  <td className={`${td} text-xs text-nexo-dim`}>{l.lastFetchAt ? formatDay(l.lastFetchAt, timeZone) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <SectionHeader title="Tarefas da DataForSEO" hint={`${tasks.length} ${tasks.length === 1 ? 'tarefa' : 'tarefas'} · US$ ${totalCost.toFixed(4).replace('.', ',')} no total`} />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/[0.02]">
              <tr className="text-left">
                <th className={th}>Criada em</th><th className={th}>Perfil</th><th className={th}>Tipo</th>
                <th className={`${th} text-right`}>Profundidade</th><th className={th}>Status</th><th className={`${th} text-right`}>Custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexo-border">
              {tasks.map((t) => (
                <tr key={t.taskId}>
                  <td className={`${td} text-xs text-nexo-dim`}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(t.createdAt))}</td>
                  <td className={td}>{titles.get(t.listingId) ?? '—'}</td>
                  <td className={`${td} capitalize`}>{({ backfill: 'coleta inicial', relaunch: 'nova tentativa', refresh: 'atualização' } as Record<string, string>)[t.kind] ?? t.kind}</td>
                  <td className={`${td} text-right`}>{t.depth}</td>
                  <td className={td}>
                    <span className={`text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-nexo ${
                      t.status === 'ready' ? 'text-nexo-ice bg-nexo-ice/10' : t.status === 'error' ? 'text-nexo-danger-text bg-nexo-danger/10' : 'text-nexo-warn-text bg-nexo-warn/10'
                    }`} title={t.errorMessage ?? undefined}>{({ posting: 'enviando', pending: 'pendente', ready: 'pronto', error: 'erro' } as Record<string, string>)[t.status] ?? t.status}</span>
                    {t.errorMessage && <span className="ml-2 text-xs text-nexo-danger-text">{t.errorMessage}</span>}
                  </td>
                  <td className={`${td} text-right`}>{t.cost !== null ? `US$ ${t.cost.toFixed(5).replace('.', ',')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
