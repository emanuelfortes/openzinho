import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getTrackedKeywords, getRankHistory, getLatestRankCheck,
  getSetting, getTargetDomains, getPendingRankTasks, getRankTrackerSchedule,
} from '@/lib/db';
import { LANGUAGES } from '@/lib/geo-options';
import {
  addKeywordAction, removeKeywordAction, checkOneAction, checkAllAction,
  saveDepthAction, addDomainAction, removeDomainAction, checkDomainAction, saveRankScheduleAction,
} from './actions';
import RankTrackerTable from './RankTrackerTable';
import PendingButton from '@/components/PendingButton';
import LocationPicker from '@/components/LocationPicker';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import RankTrackerQueueStatus from './RankTrackerQueueStatus';
import RankTrackerScheduleControl from './RankTrackerScheduleControl';

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchParams = { domain?: string };

const inputCls = 'nexo-input min-w-0 w-full px-4 py-3 focus:ring-4 focus:ring-nexo-sky outline-none text-sm font-medium transition-all';

// ─── Page ─────────────────────────────────────────────────────────────────────

async function RankTrackerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const creds = getCredentials();
  const defaultLocation = getSetting('default_location') ?? 'Brazil';
  const defaultLanguage = getSetting('default_language') ?? 'Portuguese';
  const rankDepth = getSetting('rank_tracker_depth') ?? '20';

  // Merge target_domains table with unique domains from tracked keywords
  const savedDomains = getTargetDomains();
  const allKeywords = getTrackedKeywords();
  const pendingRankTasks = getPendingRankTasks();
  const rankSchedule = getRankTrackerSchedule();
  const pendingKeywordIds = pendingRankTasks.map((task) => task.keywordId);
  const kwDomains = [...new Set(allKeywords.map((k) => k.domain))];
  const domains = [...new Set([...savedDomains, ...kwDomains])];

  // Active domain from URL, or first available
  const activeDomain = params.domain ?? domains[0] ?? null;

  // Keywords for the active domain
  const keywords = activeDomain ? allKeywords.filter((k) => k.domain === activeDomain) : [];

  const rows = keywords.map((kw) => {
    const history = getRankHistory(kw.id, 30);
    const latest = getLatestRankCheck(kw.id);
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
    return { kw, history, latest, previous };
  });

  const csvData = rows.map(({ kw, latest, previous }) => ({
    keyword: kw.keyword,
    location: kw.location,
    language: kw.language,
    position: latest?.position ?? '',
    previous_position: previous?.position ?? '',
    checked_at: latest ? new Date(latest.checkedAt).toISOString().split('T')[0] : '',
    url: latest?.url ?? '',
    ai_overview: latest?.aiOverview == null ? '' : latest.aiOverview ? 'Citado' : 'Não citado',
  }));
  const csvColumns = [
    { key: 'keyword', label: 'Palavra-chave' },
    { key: 'location', label: 'Local' },
    { key: 'language', label: 'Idioma' },
    { key: 'position', label: 'Posição' },
    { key: 'previous_position', label: 'Posição anterior' },
    { key: 'checked_at', label: 'Verificado em' },
    { key: 'url', label: 'URL ranqueada' },
    { key: 'ai_overview', label: 'AI Overview' },
  ];

  return (
    <div className="space-y-6 pb-12">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="nexo-h1">Rank Tracker</h1>
          <p className="text-nexo-dim text-sm mt-1 font-medium">
            {allKeywords.length} {allKeywords.length !== 1 ? 'palavras-chave' : 'palavra-chave'} em {domains.length} {domains.length !== 1 ? 'domínios' : 'domínio'}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <RankTrackerQueueStatus count={pendingRankTasks.length} />
          <form action={saveDepthAction} className="flex items-center gap-2">
            <label className="nexo-label whitespace-nowrap">Top</label>
            <select
              name="rank_tracker_depth"
              defaultValue={rankDepth}
              className="nexo-input min-w-0 w-full px-3 py-2 text-xs font-medium focus:ring-4 focus:ring-nexo-sky outline-none"
            >
              {['10', '20', '50', '100'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button type="submit" className="px-3 py-2 text-[9px] font-medium uppercase tracking-widest rounded-nexo-lg bg-nexo-surface-2 text-nexo-dim hover:bg-white/[0.04] transition-all">
              Salvar
            </button>
          </form>

          {allKeywords.length > 0 && creds && (
            <form action={checkAllAction}>
              <input type="hidden" name="domain" value={activeDomain ?? ''} />
              <PendingButton
                type="submit"
                className="nexo-label px-5 py-3 bg-white text-nexo-bg rounded-nexo-lg hover:bg-nexo-ice transition-all"
                pendingClassName="px-5 py-3 bg-white/30 text-white text-[10px] font-medium uppercase tracking-widest rounded-nexo-lg cursor-not-allowed"
                pendingChildren={`Enfileirando ${allKeywords.length}…`}
              >
                Enfileirar todas ({allKeywords.length})
              </PendingButton>
            </form>
          )}
        </div>
      </div>

      <RankTrackerScheduleControl schedule={rankSchedule} saveAction={saveRankScheduleAction} />

      {!creds && (
        <div className="bg-nexo-warn/10 border border-nexo-warn/40 text-nexo-warn-text rounded-nexo-lg px-6 py-4 text-sm font-medium">
          Configure suas credenciais da DataForSEO em Configurações para ativar a verificação de posições.
        </div>
      )}

      {/* ── Domain tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {domains.map((domain) => {
          const isActive = domain === activeDomain;
          const kwCount = allKeywords.filter((k) => k.domain === domain).length;
          return (
            <div key={domain} className="flex items-center gap-0.5">
              <a
                href={`/dashboard/rank-tracker?domain=${encodeURIComponent(domain)}`}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-nexo-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-nexo-surface-2 text-white shadow-lg'
                    : 'bg-nexo-surface border border-nexo-border text-nexo-dim hover:border-nexo-border hover:bg-white/[0.04]'
                }`}
              >
                {domain}
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md ${isActive ? 'bg-nexo-bg/20 text-white' : 'bg-nexo-surface-2 text-nexo-faint'}`}>
                  {kwCount}
                </span>
              </a>
              <form action={removeDomainAction}>
                <input type="hidden" name="domain" value={domain} />
                <button
                  type="submit"
                  title="Remover domínio"
                  className={`px-1.5 py-2 text-[10px] rounded-nexo transition-all ${
                    isActive
                      ? 'text-nexo-faint hover:text-nexo-danger-text hover:bg-nexo-danger/15'
                      : 'text-nexo-faint hover:text-nexo-danger-text hover:bg-nexo-danger/15'
                  }`}
                >
                  ×
                </button>
              </form>
            </div>
          );
        })}

        {/* Add domain inline form */}
        <form action={addDomainAction} className="flex items-center gap-2 ml-2">
          <input
            name="domain"
            type="text"
            placeholder="novodominio.com"
            className="nexo-input min-w-0 px-3 py-2 border-dashed text-xs font-medium focus:ring-4 focus:ring-nexo-sky outline-none w-40 transition-all"
          />
          <button
            type="submit"
            className="nexo-label px-3 py-2 bg-nexo-surface border border-nexo-border rounded-nexo-lg hover:bg-white/10 hover:text-white hover:border-nexo-border-strong transition-all"
          >
            + Adicionar
          </button>
        </form>
      </div>

      {/* ── Empty state: no domains ─────────────────────────────────────────── */}
      {domains.length === 0 && (
        <div className="bg-nexo-surface border border-dashed border-nexo-border rounded-nexo-lg p-16 text-center">
          <p className="font-medium text-nexo-dim mb-1">Nenhum domínio ainda</p>
          <p className="text-nexo-faint text-sm">Adicione um domínio acima para começar a monitorar as posições das palavras-chave.</p>
        </div>
      )}

      {/* ── Domain view ────────────────────────────────────────────────────── */}
      {activeDomain && (
        <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">

          {/* Keywords table */}
          <div className="xl:col-span-2">
            {rows.length === 0 ? (
              <div className="bg-nexo-surface border border-dashed border-nexo-border rounded-nexo-lg p-12 text-center">
                <p className="text-nexo-dim font-semibold mb-1">Nenhuma palavra-chave para {activeDomain}</p>
                <p className="text-nexo-faint text-xs">Adicione palavras-chave pelo formulário ao lado.</p>
              </div>
            ) : (
              <div id="results" className="bg-nexo-surface border border-nexo-border rounded-nexo-lg overflow-x-auto">
                <div className="px-5 py-3.5 border-b border-nexo-border flex items-center justify-between gap-4">
                  <span className="nexo-label">
                    {activeDomain} — {rows.length} {rows.length !== 1 ? 'palavras-chave' : 'palavra-chave'}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-nexo-faint hidden sm:block">Clique em uma linha para ver o histórico</span>
                    <CopyMarkdownButton data={csvData} columns={csvColumns} />
                    {creds && (
                      <form action={checkDomainAction}>
                        <input type="hidden" name="domain" value={activeDomain} />
                        <PendingButton
                          type="submit"
                          className="px-3 py-1.5 bg-nexo-blue text-white text-[9px] font-medium uppercase tracking-widest rounded-nexo hover:bg-nexo-sky transition-all"
                          pendingClassName="px-3 py-1.5 bg-nexo-sky/40 text-white text-[9px] font-medium uppercase tracking-widest rounded-nexo cursor-not-allowed"
                          pendingChildren={`Enfileirando ${rows.length}…`}
                        >
                          Enfileirar {rows.length}
                        </PendingButton>
                      </form>
                    )}
                  </div>
                </div>
                <RankTrackerTable
                  rows={rows}
                  hasCreds={!!creds}
                  pendingKeywordIds={pendingKeywordIds}
                  checkAction={checkOneAction}
                  removeAction={removeKeywordAction}
                />
              </div>
            )}
          </div>

          {/* Add keywords form */}
          <div>
            <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-6 sticky top-6">
              <h2 className="text-xs font-medium text-nexo-text uppercase tracking-widest mb-1">Adicionar palavras-chave</h2>
              <p className="text-[10px] text-nexo-faint font-medium mb-5">para {activeDomain}</p>
              <form action={addKeywordAction} className="space-y-4">
                <input type="hidden" name="domain" value={activeDomain} />

                <div className="space-y-1.5">
                  <label className="nexo-label">
                    Palavras-chave <span className="text-nexo-faint normal-case font-normal tracking-normal">(uma por linha, máx. 50)</span>
                  </label>
                  <textarea
                    name="keywords"
                    required
                    rows={5}
                    placeholder={"encanador são paulo\nencanador 24 horas\ndesentupimento de ralo"}
                    className={`${inputCls} resize-y font-mono`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="nexo-label">Local</label>
                  <LocationPicker name="location" defaultValue={defaultLocation} className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <label className="nexo-label">Idioma</label>
                  <select name="language" defaultValue={defaultLanguage} className={inputCls}>
                    {LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>

                <PendingButton
                  type="submit"
                  className="w-full bg-nexo-blue text-white py-3 rounded-nexo-lg font-medium uppercase text-[10px] tracking-[0.2em] hover:bg-nexo-sky transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  pendingClassName="w-full bg-nexo-sky/40 text-white py-3 rounded-nexo-lg font-medium uppercase text-[10px] tracking-[0.2em] cursor-not-allowed"
                  pendingChildren="Adicionando…"
                >
                  Adicionar
                </PendingButton>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(RankTrackerPage);
