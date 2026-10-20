import { withProjectScope } from '@/lib/db';
import { getCredentials, getBlPageIntHistory, saveBlPageInt, getBlPageIntResults, type BlPageIntEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import PageIntersectionTable, { type PageIntItem } from './PageIntersectionTable';

interface SearchParams { targets?: string; history_id?: string; }

interface PageIntBacklink { url_from?: string; domain_from?: string; url_to?: string; page_from_rank?: number; backlink_spam_score?: number; }
interface PageIntApiItem { page_intersection?: Record<string, PageIntBacklink[] | null | undefined>; }

async function fetchPageInt(targets: string[], login: string, pass: string): Promise<{ items: PageIntItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: PageIntApiItem[] }>(
    'backlinks/page_intersection/live',
    { targets: Object.fromEntries(targets.map((t, i) => [String(i + 1), t])), limit: 500, order_by: ['1.page_from_rank,desc'] },
    { login, pass },
  );
  if (error) return { items: [], error };
  // Each item is one referring page; page_intersection lists its backlinks per target index
  const items = (result?.items ?? []).map((item): PageIntItem => {
    const perTarget = Object.values(item.page_intersection ?? {}).filter((bls): bls is PageIntBacklink[] => !!bls?.length);
    const first = perTarget[0]?.[0];
    return {
      url_from: first?.url_from,
      domain_from: first?.domain_from,
      page_from_rank: first?.page_from_rank,
      backlinks_spam_score: first?.backlink_spam_score,
      url_to: perTarget.map((bls) => bls[0].url_to ?? ''),
    };
  });
  return { items, cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function BacklinksPageIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawTargets = params.targets?.trim() ?? '';
  const historyId = params.history_id;

  let items: PageIntItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let targetList: string[] = [];
  let activeEntry: BlPageIntEntry | null = null;

  if (historyId) {
    const saved = getBlPageIntResults<PageIntItem>(historyId);
    if (saved) {
      items = saved;
      activeEntry = getBlPageIntHistory().find((e) => e.id === historyId) ?? null;
      targetList = (activeEntry?.targets ?? '').split(', ');
    } else error = 'Esta busca não está mais disponível.';
  } else if (rawTargets) {
    targetList = rawTargets.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 20);
    if (targetList.length < 2) { error = 'Informe pelo menos 2 alvos (um por linha).'; }
    else {
      const dedupeId = stableSearchId(['bl-page-intersection', targetList.join(',')]);
      const cached = getBlPageIntResults<PageIntItem>(dedupeId);
      if (cached) {
        items = cached;
        const cachedEntry = getBlPageIntHistory().find((e) => e.id === dedupeId);
        cost = cachedEntry?.cost;
      } else if (!creds) { error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.'; }
      else {
        const result = await fetchPageInt(targetList, creds.login, creds.pass);
        items = result.items; cost = result.cost; error = result.error ?? null;
        if (!error && items.length > 0) {
          const entry: BlPageIntEntry = { id: dedupeId, ts: Date.now(), targets: targetList.join(', '), count: items.length, cost };
          saveBlPageInt(entry, items);
        }
      }
    }
  }

  const history = getBlPageIntHistory();

  const csvData = items.map((item) => ({
    url_from: item.url_from ?? '',
    domain_from: item.domain_from ?? '',
    page_from_rank: item.page_from_rank ?? '',
    spam_score: item.backlinks_spam_score ?? '',
    targets_linked: item.url_to?.length ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Interseção de páginas</span>
        </div>
        <h1 className="nexo-h1">Interseção de páginas de backlinks</h1>
        <p className="text-sm text-nexo-faint mt-1">Encontre páginas externas que apontam ao mesmo tempo para vários dos seus alvos.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Encontrar interseção" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div>
          <label className="nexo-label block mb-1.5">URLs ou domínios alvo <span className="normal-case font-normal tracking-normal text-nexo-faint">(2–20, um por linha)</span></label>
          <textarea name="targets" rows={4} defaultValue={activeEntry ? targetList.join('\n') : rawTargets} placeholder={"exemplo.com.br\nhttps://exemplo.com.br/pagina-a\nhttps://outro.com"} required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono resize-y" />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || rawTargets) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <span className="nexo-label">{items.length} {items.length === 1 ? 'página aponta' : 'páginas apontam'} para todos os alvos</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'url_from',label:'URL de origem'},{key:'domain_from',label:'Domínio'},{key:'page_from_rank',label:'DR'},{key:'spam_score',label:'Spam'},{key:'targets_linked',label:'Alvos vinculados'}]} />
                  <ExportCSVButton data={csvData} filename="backlinks-page-intersection.csv" columns={[{key:'url_from',label:'URL de origem'},{key:'domain_from',label:'Domínio'},{key:'page_from_rank',label:'DR'},{key:'spam_score',label:'Spam'},{key:'targets_linked',label:'Alvos vinculados'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhuma página em comum encontrada.</div>
          ) : (
            <PageIntersectionTable items={items} />
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/backlinks/page-intersection?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.targets}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} {entry.count === 1 ? 'resultado' : 'resultados'}{entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-nexo-faint">{formatDate(entry.ts)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(BacklinksPageIntersectionPage);
