import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getTrackedPrompts, getLatestPromptChecks, getPromptCheckTotals, getPromptChecks,
  getPromptTrackerSchedule, type PromptCheck, type TrackedPrompt,
} from '@/lib/db';
import { PLATFORM_LABELS } from '@/lib/llm-options';
import { getBrandSettings } from '@/lib/brand-server';
import {
  checkStatus, formatCost, formatRate, legendMarkdown, overviewPdf, promptPdf, STATUS_LABEL, type OverviewItem,
} from '@/lib/prompt-report';
import {
  addPromptAction, removePromptAction, checkPromptAction, checkAllPromptsAction, savePromptScheduleAction,
} from './actions';
import PromptTrackerForm from './PromptTrackerForm';
import PromptScheduleControl from './PromptScheduleControl';
import PromptCalendar from './PromptCalendar';
import DotStrip from './DotStrip';
import StatusDot from './StatusDot';
import PendingButton from '@/components/PendingButton';
import MarkdownAnswer from '@/components/MarkdownAnswer';
import ReportPdfExportButton from '@/components/ReportPdfExportButton';
import CopyMarkdownLink from '@/components/CopyMarkdownLink';

type SearchParams = { prompt?: string };

// Checks loaded per prompt for the accordion. The calendar and markdown export read the full history.
const HISTORY_SHOWN = 50;
// Full history for the calendar and the PDF; the markdown export reads the same range.
const FULL_HISTORY = 366;

const BUTTON_SECONDARY = 'nexo-label rounded-nexo bg-nexo-surface-2 px-3 py-1.5 transition-colors hover:bg-white/[0.04] disabled:opacity-40';
const BUTTON_DANGER = 'rounded-nexo px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text transition-colors hover:bg-nexo-danger/15';

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function targetLabel(prompt: TrackedPrompt) {
  return [prompt.brand, prompt.domain].filter(Boolean).join(' · ');
}

function StatusBadge({ check }: { check: PromptCheck | undefined }) {
  if (!check) return <span className="nexo-label rounded-md bg-nexo-surface-2 px-2 py-0.5">Não verificado</span>;
  const status = checkStatus(check);
  const tone = status === 'cited'
    ? 'bg-nexo-ice/10 text-nexo-ice'
    : status === 'error'
      ? 'bg-nexo-danger/10 text-nexo-danger-text'
      : 'bg-nexo-surface-2 text-nexo-dim';
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest ${tone}`}>{STATUS_LABEL[status]}</span>;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border px-5 py-4">
      <p className="nexo-label">{label}</p>
      <p className="nexo-metric font-mono text-2xl mt-1 tabular-nums">{value}</p>
    </div>
  );
}

async function PromptTrackerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const brand = getBrandSettings();
  const brandName = brand.name;
  const brandLogoUrl = brand.logo ?? undefined;

  const prompts = getTrackedPrompts();
  const latest = getLatestPromptChecks();
  const totals = getPromptCheckTotals();
  const schedule = getPromptTrackerSchedule();
  const selectedId = Number(params.prompt);

  // Everything the accordion needs, loaded once. Checks come newest first, reversed for the dot strip.
  const items: OverviewItem[] = prompts.map((prompt) => {
    const t = totals.get(prompt.id) ?? { total: 0, mentioned: 0 };
    return {
      prompt,
      checks: getPromptChecks(prompt.id, FULL_HISTORY),
      total: t.total,
      mentioned: t.mentioned,
      latest: latest.get(prompt.id),
    };
  });

  const checksRun = items.reduce((sum, i) => sum + i.total, 0);
  const mentionsFound = items.reduce((sum, i) => sum + i.mentioned, 0);
  const promptsMentioned = items.filter((i) => i.latest?.mentioned).length;
  const overall = checksRun > 0 ? `${Math.round((mentionsFound / checksRun) * 100)}%` : '—';

  const overviewReport = overviewPdf(items);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Monitor de prompts</h1>
        <p className="text-sm text-nexo-faint mt-1">
          Salve um prompt, execute-o de novo quando quiser ou todos os dias e veja se sua marca ou domínio aparece na resposta.
        </p>
      </div>

      {!creds && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text text-sm rounded-nexo-lg px-4 py-3">
          Credenciais da DataForSEO ausentes. Configure-as em{' '}
          <a href="/dashboard/settings" className="underline font-semibold">Configurações</a>.
        </div>
      )}

      <PromptTrackerForm action={addPromptAction} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Prompts monitorados" value={String(prompts.length)} />
        <StatTile label="Mencionados na última verificação" value={`${promptsMentioned} / ${prompts.length}`} />
        <StatTile label="Verificações executadas" value={String(checksRun)} />
        <StatTile label="Taxa geral de menção" value={overall} />
      </div>

      <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[16rem]">
          <PromptScheduleControl schedule={schedule} saveAction={savePromptScheduleAction} />
        </div>
        <form action={checkAllPromptsAction}>
          <PendingButton
            type="submit"
            disabled={!creds || prompts.length === 0}
            className="nexo-label rounded-nexo-lg bg-white px-4 py-2.5 text-nexo-bg transition-colors hover:bg-nexo-sky disabled:opacity-40"
            pendingClassName="rounded-nexo-lg bg-white/30 px-4 py-2.5 text-[10px] font-medium uppercase tracking-widest text-white "
            pendingChildren="Verificando todos…"
          >
            Verificar todos agora
          </PendingButton>
        </form>
      </div>

      {prompts.length === 0 ? (
        <div className="bg-nexo-surface rounded-nexo-lg border border-dashed border-nexo-border p-10 text-center">
          <p className="text-nexo-faint text-sm">Nenhum prompt monitorado ainda. Adicione um acima e execute-o para ver se sua marca aparece.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-[11px] text-nexo-faint">
              <span className="flex items-center gap-1.5"><StatusDot status="cited" size="sm" /> Citado</span>
              <span className="flex items-center gap-1.5"><StatusDot status="not-cited" size="sm" /> Não citado</span>
              <span className="flex items-center gap-1.5"><StatusDot status="error" size="sm" /> Erro</span>
              <span className="flex items-center gap-1.5"><StatusDot status={null} size="sm" /> Sem verificação</span>
            </div>
            <div className="flex items-center gap-2">
              <CopyMarkdownLink href="/api/prompt-tracker/export" label="Copiar visão geral em Markdown" />
              <ReportPdfExportButton
                brandName={brandName}
                brandLogoUrl={brandLogoUrl}
                brandColor={brand.color}
                brandFooter={brand.footer}
                brandStyle={brand}
                filename="prompt-tracker-overview.pdf"
                title="Visão geral do monitor de prompts"
                subject={`${prompts.length} prompt${prompts.length === 1 ? '' : 's'}`}
                generatedAt={Date.now()}
                metrics={overviewReport.metrics}
                sections={overviewReport.sections}
              />
            </div>
          </div>

          <div className="space-y-2">
            {items.map((item) => {
              const { prompt, checks, total, mentioned, latest: last } = item;
              const isOpen = selectedId === prompt.id;
              const rate = formatRate(total, mentioned);
              const report = promptPdf({ prompt, checks, total, mentioned, generatedAt: Date.now() });
              return (
                <details
                  key={prompt.id}
                  open={isOpen}
                  className="group bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
                    <span className="text-nexo-faint transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
                    <div className="min-w-0 flex-1 basis-72">
                      <p className="truncate text-sm font-semibold text-nexo-text">{prompt.prompt}</p>
                      <p className="mt-0.5 text-[11px] text-nexo-faint">
                        {PLATFORM_LABELS[prompt.platform] ?? prompt.platform} · {prompt.model} · {targetLabel(prompt)}
                      </p>
                    </div>
                    <DotStrip checks={checks} />
                    <div className="flex items-center gap-3 text-xs">
                      <StatusBadge check={last} />
                      <span className="tabular-nums font-semibold text-nexo-dim">{rate}</span>
                    </div>
                  </summary>

                  <div className="space-y-6 border-t border-nexo-border px-5 py-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={checkPromptAction}>
                        <input type="hidden" name="id" value={prompt.id} />
                        <PendingButton type="submit" disabled={!creds} className={BUTTON_SECONDARY} pendingClassName={`${BUTTON_SECONDARY} opacity-60`} pendingChildren="Verificando…">
                          Verificar agora
                        </PendingButton>
                      </form>
                      <CopyMarkdownLink href={`/api/prompt-tracker/export?id=${prompt.id}`} />
                      <ReportPdfExportButton
                        brandName={brandName}
                        brandLogoUrl={brandLogoUrl}
                        brandColor={brand.color}
                        brandFooter={brand.footer}
                        brandStyle={brand}
                        filename={`prompt-${prompt.id}-report.pdf`}
                        title="Relatório do prompt"
                        subject={prompt.prompt}
                        generatedAt={Date.now()}
                        metrics={report.metrics}
                        sections={report.sections}
                      />
                      <form action={removePromptAction} className="ml-auto">
                        <input type="hidden" name="id" value={prompt.id} />
                        <PendingButton type="submit" className={BUTTON_DANGER} pendingChildren="Removendo…">Remover</PendingButton>
                      </form>
                    </div>

                    <section className="space-y-2">
                      <p className="nexo-label">Calendário</p>
                      <PromptCalendar checks={checks} />
                    </section>

                    <section className="space-y-2">
                      <p className="nexo-label">
                        Histórico de verificações {checks.length > HISTORY_SHOWN && <span className="normal-case font-normal tracking-normal">(últimas {HISTORY_SHOWN} de {checks.length})</span>}
                      </p>
                      {checks.length === 0 ? (
                        <p className="text-sm text-nexo-faint">Ainda não verificado. Use “Verificar agora” para executar este prompt.</p>
                      ) : (
                        <ul className="divide-y divide-nexo-border">
                          {checks.slice(0, HISTORY_SHOWN).map((check) => (
                            <li key={check.id} className="py-3 space-y-2">
                              <div className="flex flex-wrap items-center gap-3">
                                <StatusDot status={checkStatus(check)} />
                                <StatusBadge check={check} />
                                <span className="text-xs text-nexo-dim">{formatDateTime(check.checkedAt)}</span>
                                {!check.error && (
                                  <span className="text-[11px] text-nexo-faint">
                                    {check.brandMentions} {check.brandMentions === 1 ? 'menção à marca' : 'menções à marca'} · domínio {check.domainCited ? 'citado' : 'não citado'}
                                  </span>
                                )}
                                <span className="ml-auto font-mono text-[11px] text-nexo-faint">{formatCost(check.cost)}</span>
                              </div>

                              {check.error && <p className="text-xs text-nexo-danger-text">{check.error}</p>}

                              {check.answer && (
                                <details>
                                  <summary className="cursor-pointer text-xs font-semibold text-nexo-sky">Mostrar resposta</summary>
                                  <div className="mt-2">
                                    <MarkdownAnswer>{check.answer}</MarkdownAnswer>
                                  </div>
                                </details>
                              )}

                              {check.sources.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {check.sources.map((source, i) => (
                                    <a
                                      key={`${source.url}-${i}`}
                                      href={source.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={source.title ?? source.url}
                                      className="text-[11px] text-nexo-sky bg-nexo-blue/10 border border-nexo-border-strong px-2 py-0.5 rounded-md hover:bg-nexo-blue/15 transition-colors max-w-[220px] truncate"
                                    >
                                      {source.title ?? source.url}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  </div>
                </details>
              );
            })}
          </div>
          <p className="text-[11px] text-nexo-faint">Legenda das exportações: {legendMarkdown()}</p>
        </>
      )}

      <p className="text-nexo-faint text-xs">Dados da API DataForSEO LLM Responses. Cada verificação é cobrada como uma execução do Teste de prompt em IA.</p>
    </div>
  );
}

export default withProjectScope(PromptTrackerPage);
