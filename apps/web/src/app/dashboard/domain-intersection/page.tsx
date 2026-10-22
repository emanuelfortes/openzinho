import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import {
  getCredentials, getDomainIntersectionHistory,
  saveDomainIntersectionSearch, getDomainIntersectionResults, getSetting,
} from '@/lib/db';
import { toLabsCountry } from '@/lib/geo-options';
import LabsLocationLanguageFields from '@/components/LabsLocationLanguageFields';
import SearchForm from '@/components/SearchForm';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import IntersectionTable, { type IntersectionItem } from './IntersectionTable';

interface SearchParams {
  target1?: string;
  target2?: string;
  location?: string;
  language?: string;
  limit?: string;
  history_id?: string;
}

async function fetchIntersection(target1: string, target2: string, location: string, language: string, limit: number, login: string, pass: string): Promise<{ items: IntersectionItem[]; total: number; cost: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ total_count?: number; items?: IntersectionItem[] }>(
    'dataforseo_labs/google/domain_intersection/live',
    {
      target1,
      target2,
      location_name: location,
      language_name: language,
      limit,
      order_by: ['keyword_data.keyword_info.search_volume,desc'],
    },
    { login, pass },
  );
  // This endpoint used to silently swallow any DataForSEO-level error (bad status_code, invalid
  // field, etc.) as an empty result with cost 0 — never shown to the user. Now surfaced via `error`.
  return { items: result?.items ?? [], total: result?.total_count ?? 0, cost: cost ?? 0, error };
}

async function DomainIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const history = getDomainIntersectionHistory();
  const defaultLocation = toLabsCountry(getSetting('default_location') || 'Brazil');
  const defaultLanguage = getSetting('default_language') || 'Portuguese';
  const defaultDomain = getSetting('default_domain') ?? '';

  const params = await searchParams;
  const historyId = params.history_id;
  const target1 = params.target1?.trim() ?? '';
  const target2 = params.target2?.trim() ?? '';
  const location = params.location ?? defaultLocation;
  const language = params.language ?? defaultLanguage;
  const limit = Math.min(Number(params.limit ?? 100), 1000);

  let items: IntersectionItem[] = [];
  let total = 0;
  let error = '';
  let cost = 0;

  if (historyId) {
    items = getDomainIntersectionResults<IntersectionItem>(historyId) ?? [];
    const entry = history.find((h) => h.id === historyId);
    total = entry?.totalCount ?? items.length;
  } else if (target1 && target2 && creds) {
    try {
      const dedupeId = stableSearchId(['domain-intersection', target1, target2, location, language, limit]);
      const cachedItems = getDomainIntersectionResults<IntersectionItem>(dedupeId);
      if (cachedItems) {
        items = cachedItems;
        const cachedEntry = history.find((h) => h.id === dedupeId);
        total = cachedEntry?.totalCount ?? items.length;
        cost = cachedEntry?.cost ?? 0;
      } else {
        const result = await fetchIntersection(target1, target2, location, language, limit, creds.login, creds.pass);
        if (result.error) {
          error = result.error;
        } else {
          items = result.items;
          total = result.total;
          cost = result.cost;
          saveDomainIntersectionSearch({
            id: dedupeId, ts: Date.now(), target1, target2, location, language,
            count: items.length, totalCount: total, cost,
          }, items);
        }
      }
    } catch (e) {
      error = String(e);
    }
  }

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="nexo-h1">Interseção de domínios</h1>
        <p className="text-nexo-dim text-sm mt-1 font-medium">Palavras-chave em que dois domínios ranqueiam ao mesmo tempo</p>
      </div>

      <div className="grid gap-6 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="xl:col-span-2 space-y-5">
          <SearchForm className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-6 space-y-4" btnLabel="Analisar" btnClassName="w-full bg-nexo-blue text-white py-3 rounded-nexo-lg font-medium uppercase text-[10px] tracking-widest hover:bg-nexo-sky transition-all disabled:opacity-40" disabled={!creds}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="nexo-label">Domínio 1</label>
                <input name="target1" type="text" defaultValue={target1 || defaultDomain} placeholder="example.com" className="nexo-input min-w-0 w-full px-4 py-3 outline-none focus:ring-4 focus:ring-nexo-sky text-sm font-medium transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="nexo-label">Domínio 2</label>
                <input name="target2" type="text" defaultValue={target2} placeholder="concorrente.com.br" className="nexo-input min-w-0 w-full px-4 py-3 outline-none focus:ring-4 focus:ring-nexo-sky text-sm font-medium transition-all" />
              </div>
              <LabsLocationLanguageFields
                defaultLocation={location}
                defaultLanguage={language}
                className="w-full px-4 py-3 bg-white/[0.02] border border-nexo-border rounded-nexo-lg outline-none text-sm font-medium text-nexo-text"
                wrapperClassName="space-y-1.5"
                labelClassName="nexo-label "
              />
            </div>
            <div className="space-y-1.5">
              <label className="nexo-label">Limite</label>
              <select name="limit" defaultValue={String(limit)} className="nexo-input min-w-0 w-48 px-4 py-3 outline-none text-sm font-medium">
                {[50, 100, 250, 500, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            {!creds && <p className="text-xs text-nexo-warn-text font-medium">Configure primeiro as credenciais da API em Configurações.</p>}
          </SearchForm>

          {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text rounded-nexo-lg px-5 py-3 text-sm">{error}</div>}

          {items.length > 0 && (
            <div className="space-y-3">
              <p className="nexo-label">
                {items.length} exibidas / {total.toLocaleString('pt-BR')} {total === 1 ? 'palavra-chave em comum' : 'palavras-chave em comum'}
                {cost > 0 && <span className="ml-3 text-nexo-faint">· US$ {cost.toFixed(4).replace('.', ',')}</span>}
              </p>

              {/* Domain header */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-nexo-blue/10 border border-nexo-border-strong rounded-nexo-lg px-4 py-3 text-center">
                  <p className="nexo-section">Domínio 1</p>
                  <p className="font-medium text-nexo-sky mt-0.5">{target1}</p>
                </div>
                <div className="bg-white/[0.02] border border-nexo-border rounded-nexo-lg px-4 py-3 text-center">
                  <p className="nexo-label">Domínio 2</p>
                  <p className="font-medium text-nexo-dim mt-0.5">{target2}</p>
                </div>
              </div>

              <IntersectionTable items={items} target1={target1} target2={target2} />
            </div>
          )}
        </div>

        {/* History */}
        <div>
          <div className="bg-nexo-surface border border-nexo-border rounded-nexo-lg p-5 sticky top-6">
            <h2 className="nexo-label mb-4">Histórico</h2>
            {history.length === 0 ? (
              <p className="text-xs text-nexo-faint">Nenhuma busca ainda.</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <a key={h.id} href={`?history_id=${h.id}`} className="block rounded-nexo-lg px-3 py-2.5 hover:bg-white/[0.04] transition-colors border border-transparent hover:border-nexo-border">
                    <div className="font-medium text-xs text-nexo-text">{h.target1} <span className="text-nexo-faint">vs</span> {h.target2}</div>
                    <div className="text-[10px] text-nexo-faint mt-0.5">
                      {h.totalCount.toLocaleString('pt-BR')} em comum · {new Date(h.ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default withProjectScope(DomainIntersectionPage);
