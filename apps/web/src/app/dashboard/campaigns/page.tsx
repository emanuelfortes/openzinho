import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { getCurrentProject, getGridResults, getSetting } from '@/lib/db';
import { getGridPreferences } from '@/lib/grid-preferences-server';
import { formatDistance } from '@/lib/grid-preferences';
import CampaignForm from '@/modules/grade/CampaignForm';
import DeleteCampaignButton from '@/modules/grade/DeleteCampaignButton';
import { getCampaign, getCampaignKeywordStatus, getCampaignSpend, listCampaigns, parseCampaignPrefill, type GridCampaign } from '@/modules/grade/campaigns-db';
import { describeGridConfig } from '@/modules/grade/grid-config';
import { estimateCampaign } from '@/modules/grade/estimate';
import { computeGradeMetrics } from '@/modules/grade/metrics';
import { formatBrl, getBudgetStatus, monthStart, type BudgetStatus } from '@/modules/custos/budget';
import { getInactivePoints, gridPointsHref } from '@/modules/grade/inactive-points-db';
import { requireUser } from '@/lib/access';
import { planOf } from '@/modules/planos/plans-db';
import { runCampaignNowAction } from './actions';

interface SearchParams {
  edit?: string;
  new?: string;
  queued?: string;
  /** Prefill for a new campaign: keywords=a,b,c, target=..., center=lat,lng. */
  keywords?: string;
  target?: string;
  center?: string;
}

const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const everyWeekday = ['Todo domingo', 'Toda segunda-feira', 'Toda terça-feira', 'Toda quarta-feira', 'Toda quinta-feira', 'Toda sexta-feira', 'Todo sábado'];

function describeSchedule(campaign: GridCampaign): string {
  const at = `às ${campaign.time_of_day}`;
  switch (campaign.frequency) {
    case 'daily': return `Todo dia ${at}`;
    case 'weekly': return `${everyWeekday[campaign.weekday ?? 1]} ${at}`;
    case 'biweekly': return `A cada duas semanas, ${weekdays[campaign.weekday ?? 1]} ${at}`;
    case 'monthly': return `Todo mês no dia ${campaign.month_day ?? 1} ${at}`;
  }
}

function formatWhen(ts: number, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(ts));
}

function CampaignCard({ campaign, queued, distanceUnit, budget }: { campaign: GridCampaign; queued: boolean; distanceUnit: ReturnType<typeof getGridPreferences>['distanceUnit']; budget: BudgetStatus }) {
  const keywords = getCampaignKeywordStatus(campaign);
  const nextRuns = keywords.map((keyword) => keyword.next_run_at).filter((value): value is number => value !== null);
  const nextRun = nextRuns.length > 0 ? Math.min(...nextRuns) : null;
  const inactive = getInactivePoints(campaign);
  const estimate = estimateCampaign({
    gridSize: campaign.grid_size, keywordCount: campaign.keywords.length, frequency: campaign.frequency,
    queueMode: campaign.queue_mode, inactivePoints: inactive.size, depth: campaign.depth,
  });
  const spent = getCampaignSpend(campaign, monthStart());
  const spentBrl = spent * budget.brlPerUsd;
  const estimateBrl = estimate.perMonthUsd * budget.brlPerUsd;

  return (
    <section id={`campaign-${campaign.id}`} className="scroll-mt-6 rounded-nexo-lg border border-nexo-border bg-nexo-surface p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-medium text-nexo-text">{campaign.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${campaign.active && budget.blocked ? 'bg-nexo-danger/10 text-nexo-danger-text' : campaign.active ? 'bg-nexo-ice/10 text-nexo-ice' : 'bg-nexo-surface-2 text-nexo-dim'}`}>
              {campaign.active && budget.blocked ? 'Pausada pelo teto' : campaign.active ? 'Ativa' : 'Pausada'}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-nexo-dim">
            {campaign.target} · {campaign.grid_size}×{campaign.grid_size} · espaçamento de {formatDistance(campaign.spacing_km, distanceUnit)} · {describeGridConfig(campaign).toLowerCase()} · fila {campaign.queue_mode === 'priority' ? 'prioritária' : 'padrão'}
          </p>
          {(campaign.owner || (campaign.tags?.length ?? 0) > 0) && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-nexo-dim">
              {campaign.owner && <span>Responsável: {campaign.owner}</span>}
              {campaign.tags?.map((tag) => (
                <Link key={tag} href={`/dashboard/clientes?etiqueta=${encodeURIComponent(tag)}`} className="rounded-[3px] border border-nexo-border-strong px-1.5 text-[10px] text-nexo-sky hover:text-white">{tag}</Link>
              ))}
            </p>
          )}
          <p className="mt-0.5 text-xs text-nexo-dim">
            {describeSchedule(campaign)} ({campaign.time_zone.replace(/_/g, ' ')})
            {campaign.active && nextRun !== null && <> · próxima: {formatWhen(nextRun, campaign.time_zone)}</>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href={`/dashboard/campaigns/${campaign.id}/relatorio`} className="nexo-section hover:text-white">Relatório</Link>
          {campaign.active && (
            <form action={runCampaignNowAction}>
              <input type="hidden" name="id" value={campaign.id} />
              <button type="submit" className="nexo-section rounded-nexo-lg border border-nexo-border-strong bg-nexo-surface px-3 py-2 transition-colors hover:bg-nexo-blue/15">
                Executar agora
              </button>
            </form>
          )}
          <Link href={gridPointsHref(campaign, `/dashboard/campaigns#campaign-${campaign.id}`)} className="nexo-section hover:text-white">
            Pontos{inactive.size > 0 ? ` · ${inactive.size} desligados` : ''}
          </Link>
          <Link href={`/dashboard/campaigns?edit=${campaign.id}`} className="nexo-section hover:text-white">Editar</Link>
          <DeleteCampaignButton id={campaign.id} />
        </div>
      </div>

      {queued && (
        <p className="mt-3 rounded-nexo-lg bg-nexo-blue/10 px-3 py-2 text-[11px] font-semibold text-nexo-sky">
          Na fila. O worker envia todas as palavras-chave na próxima passagem (cerca de um minuto) e os resultados chegam conforme o DataForSEO os conclui.
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead>
            <tr className="nexo-label border-b border-nexo-border">
              <th className="py-2 pr-3">Palavra-chave</th>
              <th className="py-2 pr-3 text-right">Posição média</th>
              <th className="py-2 pr-3 text-right">Share of Voice</th>
              <th className="py-2 pr-3 text-right">Top 3</th>
              <th className="py-2">Última execução</th>
            </tr>
          </thead>
          <tbody>
            {keywords.map((keyword) => {
              const results = keyword.latestDoneRunId ? getGridResults(keyword.latestDoneRunId) : null;
              const metrics = results ? computeGradeMetrics(results, inactive) : null;
              return (
                <tr key={keyword.series_id} className="border-b border-nexo-border last:border-0">
                  <td className="py-2 pr-3 font-medium text-nexo-text">
                    {keyword.latestDoneRunId
                      ? <Link href={`/dashboard/geo-grid?grid_history_id=${keyword.latestDoneRunId}#results`} className="hover:text-nexo-sky">{keyword.keyword}</Link>
                      : keyword.keyword}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums text-nexo-text">{metrics?.avgPosition?.toLocaleString('pt-BR') ?? '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-nexo-dim">{metrics ? `${metrics.shareOfVoice}%` : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-nexo-dim">{metrics ? `${metrics.bands.top3}%` : '—'}</td>
                  <td className="py-2 text-nexo-dim">
                    {keyword.latestRun
                      ? <>{formatWhen(keyword.latestRun.ts, campaign.time_zone)}{keyword.latestRun.status === 'pending' && <span className="ml-1 font-medium text-nexo-warn-text">· em execução</span>}</>
                      : 'Ainda não executada'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-nexo-border pt-3 text-[11px] text-nexo-faint">
        <p>
          <span className="nexo-label mr-2">Gasto em {budget.monthLabel}</span>
          <b className="tabular-nums text-sm font-medium text-nexo-text">{formatBrl(spentBrl)}</b>
          <span className="ml-1">(US$ {spent.toFixed(3).replace('.', ',')})</span>
        </p>
        <p>
          <span className="nexo-label mr-2">Estimativa</span>
          <b className="tabular-nums text-sm font-medium text-nexo-dim">{formatBrl(estimateBrl)}/mês</b>
          {estimateBrl > 0 && <span className={`ml-1 ${spentBrl > estimateBrl ? 'text-nexo-warn-text' : ''}`}>· {Math.round((spentBrl / estimateBrl) * 100)}% gasto</span>}
        </p>
        <p className="basis-full text-[10px]">Gasto real informado pelo DataForSEO em cada varredura da campanha (inclusive em grades anteriores à última edição), convertido com o dólar a {formatBrl(budget.brlPerUsd)}. A estimativa é indicativa.</p>
      </div>
    </section>
  );
}

async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const campaigns = listCampaigns();
  const editing = params.edit ? getCampaign(params.edit) : null;
  const showForm = Boolean(editing) || params.new === '1' || campaigns.length === 0;
  const { distanceUnit } = getGridPreferences();
  const budget = getBudgetStatus(getCurrentProject().id);
  // Subscribers see only what the plan of the business allows; admins get every option.
  const plan = (await requireUser()).role === 'cliente' ? planOf(getCurrentProject().id) : null;
  // A link such as ?new=1&keywords=a,b&target=…&center=lat,lng opens the form prefilled.
  const prefill = parseCampaignPrefill(params);
  const defaults = {
    center: prefill.center || (getSetting('default_coordinates') ?? ''),
    language: getSetting('default_language') || 'Portuguese',
    target: prefill.target || (getSetting('default_domain') ?? ''),
    keywords: prefill.keywords,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-1 grid h-9 w-9 place-items-center rounded-nexo-lg bg-nexo-blue/10 text-nexo-sky">
            <CalendarClock className="h-4 w-4" />
          </span>
          <div>
            <h1 className="nexo-h1">Campanhas de grade</h1>
            <p className="mt-1 max-w-2xl text-sm text-nexo-dim">
              Acompanhe várias palavras-chave de uma empresa na mesma grade e no mesmo agendamento. Cada palavra-chave mantém sua própria linha do tempo Geo-Grid.
            </p>
          </div>
        </div>
        {!showForm && (
          <Link href="/dashboard/campaigns?new=1" className="rounded-nexo-lg bg-nexo-blue px-4 py-2.5 text-xs font-medium uppercase tracking-widest text-white hover:bg-nexo-sky">
            Nova campanha
          </Link>
        )}
      </div>

      {showForm && (
        <section className="rounded-nexo-lg border border-nexo-border bg-nexo-surface p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-medium text-nexo-text">{editing ? `Editar “${editing.name}”` : 'Nova campanha'}</h2>
          <CampaignForm
            key={editing?.id ?? 'new'} campaign={editing} defaults={defaults} distanceUnit={distanceUnit}
            budget={{ brlPerUsd: budget.brlPerUsd, clientCapBrl: budget.clientCapBrl, clientSpentBrl: budget.clientSpentBrl }}
            inactivePoints={editing ? [...getInactivePoints(editing)] : []}
            limits={plan ? { planName: plan.name, maxGridSize: plan.maxGridSize, maxKeywords: plan.maxKeywords, frequencies: plan.frequencies } : undefined}
          />
        </section>
      )}

      {campaigns.map((campaign) => (
        <CampaignCard key={campaign.id} campaign={campaign} queued={params.queued === campaign.id} distanceUnit={distanceUnit} budget={budget} />
      ))}

      <p className="text-[11px] text-nexo-faint">As execuções agendadas são enviadas pelo worker do Geo-Grid, que <code>npm run dev</code> e <code>npm start</code> iniciam junto com o app.</p>
    </div>
  );
}

export default withProjectScope(CampaignsPage);
