import { withProjectScope } from '@/lib/db';
import { getCredentials, getBlBulkRdHistory, saveBlBulkRd, getBlBulkRdResults, type BlBulkRdEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import BulkRdTable from './BulkRdTable';

interface BulkRdItem {
  target?: string;
  referring_domains?: number;
  referring_main_domains?: number;
  referring_ips?: number;
  broken_backlinks?: number;
  broken_pages?: number;
  referring_domains_nofollow?: number;
}

interface SearchParams { targets?: string; history_id?: string; }

async function fetchBulkRd(targets: string[], login: string, pass: string): Promise<{ items: BulkRdItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: BulkRdItem[] }>(
    'backlinks/bulk_referring_domains/live', { targets }, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function BulkRefDomainsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawTargets = params.targets?.trim() ?? '';
  const historyId = params.history_id;

  let items: BulkRdItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlBulkRdEntry | null = null;

  if (historyId) {
    const saved = getBlBulkRdResults<BulkRdItem>(historyId);
    if (saved) { items = saved; activeEntry = getBlBulkRdHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Esta busca não está mais disponível.';
  } else if (rawTargets) {
    const targetList = rawTargets.split('\n').map((t) => t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['bulk-referring-domains', targetList.join(',')]);
    const cached = getBlBulkRdResults<BulkRdItem>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlBulkRdHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.'; }
    else {
      const result = await fetchBulkRd(targetList, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlBulkRdEntry = { id: dedupeId, ts: Date.now(), targets: targetList.join(', '), count: items.length, cost };
        saveBlBulkRd(entry, items);
      }
    }
  }

  const history = getBlBulkRdHistory();
  const sorted = [...items].sort((a, b) => (b.referring_domains ?? 0) - (a.referring_domains ?? 0));

  const csvData = sorted.map((item) => ({
    target: item.target ?? '',
    referring_domains: item.referring_domains ?? '',
    referring_main_domains: item.referring_main_domains ?? '',
    referring_ips: item.referring_ips ?? '',
    referring_domains_nofollow: item.referring_domains_nofollow ?? '',
    broken_backlinks: item.broken_backlinks ?? '',
    broken_pages: item.broken_pages ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Domínios de referência em massa</span>
        </div>
        <h1 className="nexo-h1">Domínios de referência em massa</h1>
        <p className="text-sm text-nexo-faint mt-1">Contagem de domínios de referência de uma lista de domínios em uma única requisição.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Buscar" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div>
          <label className="nexo-label block mb-1.5">Domínios <span className="normal-case font-normal tracking-normal text-nexo-faint">(um por linha)</span></label>
          <textarea name="targets" rows={6} defaultValue={activeEntry?.targets?.split(', ').join('\n') ?? rawTargets} placeholder={"exemplo.com.br\nconcorrente.com.br\noutro.com"} required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono resize-y" />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || rawTargets) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <span className="nexo-label">{sorted.length} {sorted.length === 1 ? 'domínio' : 'domínios'}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              {sorted.length > 0 && <CopyMarkdownButton data={csvData} columns={[{key:'target',label:'Domínio'},{key:'referring_domains',label:'Domínios de ref.'},{key:'referring_main_domains',label:'Domínios principais'},{key:'referring_ips',label:'IPs de ref.'},{key:'referring_domains_nofollow',label:'Domínios nofollow'},{key:'broken_backlinks',label:'BL quebrados'},{key:'broken_pages',label:'Páginas quebradas'}]} />}
              {sorted.length > 0 && <ExportCSVButton data={csvData} filename="bulk-referring-domains.csv" columns={[{key:'target',label:'Domínio'},{key:'referring_domains',label:'Domínios de ref.'},{key:'referring_main_domains',label:'Domínios principais'},{key:'referring_ips',label:'IPs de ref.'},{key:'referring_domains_nofollow',label:'Domínios nofollow'},{key:'broken_backlinks',label:'BL quebrados'},{key:'broken_pages',label:'Páginas quebradas'}]} />}
            </div>
          </div>
          {sorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum resultado encontrado.</div>
          ) : (
            <BulkRdTable items={sorted} />
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
                <a key={entry.id} href={`/dashboard/backlinks/bulk-referring-domains?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.targets}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} {entry.count === 1 ? 'domínio' : 'domínios'}{entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}</p>
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

export default withProjectScope(BulkRefDomainsPage);
