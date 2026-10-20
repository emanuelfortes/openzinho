import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getSubdomainsHistory, saveSubdomainsSearch, getSubdomainsResults, type SubdomainsEntry } from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SubdomainsTable from './SubdomainsTable';

interface SubdomainItem {
  subdomain?: string;
  metrics?: {
    organic?: {
      count?: number;
      etv?: number;
      estimated_paid_traffic_cost?: number;
    };
  };
}

interface SearchParams { target?: string; location?: string; language?: string; limit?: string; history_id?: string; }

async function fetchSubdomains(target: string, location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: SubdomainItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: SubdomainItem[] }>(
    'dataforseo_labs/google/subdomains/live',
    { target, location_name: location, language_name: language, limit },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function SubdomainsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultLocation = toLabsCountry(getSetting('default_location') ?? 'Brazil');
  const defaultLanguage = getSetting('default_language') ?? 'Portuguese';

  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(parseInt(params.limit ?? '100', 10) || 100, 1000);
  const historyId = params.history_id;

  let items: SubdomainItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: SubdomainsEntry | null = null;

  if (historyId) {
    const saved = getSubdomainsResults<SubdomainItem>(historyId);
    if (saved) { items = saved; activeEntry = getSubdomainsHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Esta busca não está mais disponível.';
  } else if (rawTarget) {
    const dedupeId = stableSearchId(['subdomains', rawTarget, location, language, limit]);
    const cached = getSubdomainsResults<SubdomainItem>(dedupeId);

    if (cached) {
      items = cached;
      const cachedEntry = getSubdomainsHistory().find((e) => e.id === dedupeId);
      activeEntry = cachedEntry ?? null;
      cost = cachedEntry?.cost;
    } else if (!creds) { error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.'; }
    else {
      const result = await fetchSubdomains(rawTarget, location, language, limit, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: SubdomainsEntry = { id: dedupeId, ts: Date.now(), target: rawTarget, location, language, count: items.length, cost };
        saveSubdomainsSearch(entry, items);
      }
    }
  }

  const history = getSubdomainsHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const displayLocation = activeEntry?.location ?? location;
  const displayLanguage = activeEntry?.language ?? language;

  const csvData = items.map((item) => ({
    subdomain: item.subdomain ?? '',
    keywords: item.metrics?.organic?.count ?? '',
    traffic: item.metrics?.organic?.etv?.toFixed(0) ?? '',
    traffic_cost: item.metrics?.organic?.estimated_paid_traffic_cost?.toFixed(2) ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Subdomínios</h1>
        <p className="text-sm text-nexo-faint mt-1">Principais subdomínios por tráfego orgânico de qualquer domínio raiz.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analisar" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="nexo-label block mb-1.5">Domínio raiz</label>
            <input type="text" name="target" defaultValue={displayTarget} placeholder="example.com" required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
          </div>
          <LabsLocationLanguageFields
            defaultLocation={displayLocation}
            defaultLanguage={displayLanguage}
            className="w-full px-4 py-2.5 border border-nexo-border rounded-nexo-lg text-sm text-nexo-text focus:outline-none focus:ring-2 focus:ring-nexo-sky bg-nexo-surface"
          />
          <div>
            <label className="nexo-label block mb-1.5">Máximo de resultados</label>
            <select name="limit" defaultValue={String(limit)} className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky">
              {['50','100','200','500','1000'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <span className="nexo-label">{items.length} {items.length === 1 ? 'subdomínio' : 'subdomínios'} — {displayTarget}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'subdomain',label:'Subdomínio'},{key:'keywords',label:'Palavras-chave'},{key:'traffic',label:'Tráfego estimado (ETV)'},{key:'traffic_cost',label:'Valor do tráfego (US$)'}]} />
                  <ExportCSVButton data={csvData} filename={`subdomains-${displayTarget}.csv`} columns={[{key:'subdomain',label:'Subdomínio'},{key:'keywords',label:'Palavras-chave'},{key:'traffic',label:'Tráfego estimado (ETV)'},{key:'traffic_cost',label:'Valor do tráfego (US$)'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum subdomínio encontrado.</div>
          ) : (
            <SubdomainsTable items={items} />
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
                <a key={entry.id} href={`/dashboard/subdomains?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} {entry.count === 1 ? 'subdomínio' : 'subdomínios'} · {entry.location}{entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}</p>
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

export default withProjectScope(SubdomainsPage);
