import { withProjectScope } from '@/lib/db';
import { getCredentials, getBlBulkBlHistory, saveBlBulkBl, getBlBulkBlResults, type BlBulkBlEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import BulkBacklinksTable from './BulkBacklinksTable';

interface BulkBlItem {
  target?: string;
  backlinks?: number;
}

interface SearchParams { targets?: string; history_id?: string; }

async function fetchBulkBacklinks(targets: string[], login: string, pass: string): Promise<{ items: BulkBlItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: BulkBlItem[] }>(
    'backlinks/bulk_backlinks/live', { targets }, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function BulkBacklinksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const rawTargets = params.targets?.trim() ?? '';
  const historyId = params.history_id;

  let items: BulkBlItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlBulkBlEntry | null = null;

  if (historyId) {
    const saved = getBlBulkBlResults<BulkBlItem>(historyId);
    if (saved) { items = saved; activeEntry = getBlBulkBlHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Esta busca não está mais disponível.';
  } else if (rawTargets) {
    const targetList = rawTargets.split('\n').map((t) => t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(Boolean).slice(0, 1000);
    const dedupeId = stableSearchId(['bulk-backlinks', targetList.join(',')]);
    const cached = getBlBulkBlResults<BulkBlItem>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlBulkBlHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.'; }
    else {
      const result = await fetchBulkBacklinks(targetList, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlBulkBlEntry = { id: dedupeId, ts: Date.now(), targets: targetList.join(', '), count: items.length, cost };
        saveBlBulkBl(entry, items);
      }
    }
  }

  const history = getBlBulkBlHistory();
  const sorted = [...items].sort((a, b) => (b.backlinks ?? 0) - (a.backlinks ?? 0));

  const csvData = sorted.map((item) => ({
    target: item.target ?? '',
    backlinks: item.backlinks ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Backlinks em massa</span>
        </div>
        <h1 className="nexo-h1">Backlinks em massa</h1>
        <p className="text-sm text-nexo-faint mt-1">
          Total de backlinks de uma lista de domínios em uma única requisição.{' '}
          Precisa de domínios/IPs de referência? Use <a href="/dashboard/backlinks/bulk-referring-domains" className="text-nexo-sky hover:underline">Domínios de referência em massa</a>.
        </p>
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
              {sorted.length > 0 && <CopyMarkdownButton data={csvData} columns={[{key:'target',label:'Domínio'},{key:'backlinks',label:'Backlinks'}]} />}
              {sorted.length > 0 && <ExportCSVButton data={csvData} filename="bulk-backlinks.csv" columns={[{key:'target',label:'Domínio'},{key:'backlinks',label:'Backlinks'}]} />}
            </div>
          </div>
          {sorted.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum resultado encontrado.</div>
          ) : (
            <BulkBacklinksTable items={sorted} />
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
                <a key={entry.id} href={`/dashboard/backlinks/bulk-backlinks?history_id=${entry.id}#results`}
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

export default withProjectScope(BulkBacklinksPage);
