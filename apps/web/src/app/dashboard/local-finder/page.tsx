import { withProjectScope } from '@/lib/db';
import {
  getCredentials, getSetting, getLfHistory, saveLfSearch, getLfResults, type LfHistoryEntry,
} from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import LocalFinderForm from './LocalFinderForm';
import { type LocalPackItem } from './grid-api';

interface Rating {
  value?: number;
  votes_count?: number;
  rating_max?: number;
}

interface SearchParams {
  keyword?: string;
  location?: string;
  location_coordinate?: string;
  language?: string;
  device?: string;
  os?: string;
  depth?: string;
  min_rating?: string;
  time_filter?: string;
  history_id?: string;
}

async function fetchLocalFinder(
  params: SearchParams, login: string, pass: string,
): Promise<{ items: LocalPackItem[]; cost?: number; checkUrl?: string; error?: string }> {
  const body: Record<string, unknown> = { keyword: params.keyword, language_name: params.language };
  if (params.location_coordinate) body.location_coordinate = params.location_coordinate;
  else if (params.location) body.location_name = params.location;
  if (params.device) body.device = params.device;
  if (params.os) body.os = params.os;
  if (params.depth) body.depth = parseInt(params.depth, 10);
  if (params.min_rating) body.min_rating = parseFloat(params.min_rating);
  if (params.time_filter) body.time_filter = params.time_filter;

  const { result, cost, error } = await callDataForSeoFirst<{ check_url?: string; items?: LocalPackItem[] }>(
    'serp/google/local_finder/live/advanced', body, { login, pass }, 30_000,
  );
  if (error) return { items: [], error };
  const items = (result?.items ?? []).filter((i) => i.type === 'local_pack');
  return { items, cost, checkUrl: result?.check_url };
}

function StarRating({ rating }: { rating?: Rating }) {
  if (!rating?.value) return null;
  const pct = (rating.value / (rating.rating_max ?? 5)) * 100;
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative inline-flex text-nexo-text text-sm leading-none" style={{ letterSpacing: '-1px' }}>
        {'★★★★★'}
        <div className="absolute inset-0 overflow-hidden text-nexo-warn-text" style={{ width: `${pct}%` }}>{'★★★★★'}</div>
      </div>
      <span className="text-xs font-medium text-nexo-dim">{rating.value.toFixed(1)}</span>
      {rating.votes_count !== undefined && <span className="text-[11px] text-nexo-faint">({rating.votes_count.toLocaleString('pt-BR')})</span>}
    </div>
  );
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function lfRerunUrl(entry: LfHistoryEntry) {
  const p = new URLSearchParams(entry.params as Record<string, string>);
  p.delete('history_id');
  return `/dashboard/local-finder?${p.toString()}`;
}

async function LocalFinderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const historyId = params.history_id;

  const defaultLocation = getSetting('default_location') || 'Brazil';
  const defaultLanguage = getSetting('default_language') || 'Portuguese';
  const defaultCoordinates = getSetting('default_coordinates') ?? '';

  let items: LocalPackItem[] = [];
  let cost: number | undefined;
  let checkUrl: string | undefined;
  let error: string | null = null;
  let isFromHistory = false;
  let activeEntry: LfHistoryEntry | null = null;

  if (historyId) {
    const saved = getLfResults<LocalPackItem>(historyId);
    if (saved) {
      items = saved;
      isFromHistory = true;
      activeEntry = getLfHistory().find((e) => e.id === historyId) ?? null;
    } else {
      error = 'Busca não encontrada.';
    }
  }

  const hasQuery = historyId || params.keyword?.trim();
  if (!historyId && params.keyword?.trim()) {
    if (!creds) {
      error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.';
    } else {
      const lfId = stableSearchId(['local-finder', params.keyword, params.location_coordinate ?? params.location, params.language, params.device]);

      const lfExisting = getLfResults<LocalPackItem>(lfId);
      if (lfExisting) {
        items = lfExisting;
        isFromHistory = true;
      } else {
        const result = await fetchLocalFinder(params, creds.login, creds.pass);
        items = result.items;
        cost = result.cost;
        checkUrl = result.checkUrl;
        error = result.error ?? null;

        if (!error && items.length > 0) {
          const entry: LfHistoryEntry = {
            id: lfId,
            ts: Date.now(),
            keyword: params.keyword ?? '',
            location: params.location ?? '',
            count: items.length,
            cost: result.cost,
            params: Object.fromEntries(
              Object.entries(params).filter(([k, v]) => k !== 'history_id' && v !== undefined)
            ) as Record<string, string>,
          };
          saveLfSearch(entry, items);
        }
      }
    }
  }

  const historyIndex = getLfHistory();
  const sourceParams = activeEntry?.params ?? params;
  const formDefaults = {
    keyword: (sourceParams.keyword ?? '').toString(),
    location: (sourceParams.location ?? defaultLocation).toString(),
    locationCoordinate: (sourceParams.location_coordinate ?? '').toString(),
    defaultCenter: defaultCoordinates,
    language: (sourceParams.language ?? defaultLanguage).toString(),
    device: (sourceParams.device ?? 'desktop').toString(),
    os: (sourceParams.os ?? 'windows').toString(),
    depth: (sourceParams.depth ?? '20').toString(),
    minRating: (sourceParams.min_rating ?? '').toString(),
    timeFilter: (sourceParams.time_filter ?? '').toString(),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Local Finder</h1>
        <p className="text-sm text-nexo-faint mt-1">Resultados do pacote local do Google para qualquer palavra-chave e local.</p>
      </div>

      <LocalFinderForm defaults={formDefaults} />

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {hasQuery && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="nexo-label">Resultados</h2>
              {isFromHistory && <span className="nexo-section bg-nexo-blue/10 px-2 py-0.5 rounded-md">Histórico</span>}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
              {checkUrl && (
                <a href={checkUrl} target="_blank" rel="noopener noreferrer"
                  className="nexo-section hover:text-white transition-colors">
                  Verificar ↗
                </a>
              )}
              <span className="text-xs font-medium text-nexo-faint">{items.length} {items.length === 1 ? 'resultado' : 'resultados'}</span>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">Nenhum resultado encontrado.</div>
          ) : (
            <div className="divide-y divide-nexo-border">
              {items.map((item, i) => (
                <div key={i} className="px-6 py-5 hover:bg-white/[0.04] transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="shrink-0 w-8 h-8 rounded-nexo bg-nexo-surface-2 flex items-center justify-center">
                      <span className="text-xs font-medium text-nexo-dim">{item.rank_group}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-medium text-nexo-text">{item.title ?? '—'}</h3>
                            {item.is_paid && <span className="text-[9px] font-medium uppercase tracking-widest text-nexo-warn-text bg-nexo-warn/10 border border-nexo-warn/40 px-1.5 py-0.5 rounded">Patrocinado</span>}
                          </div>
                          {item.rating && <StarRating rating={item.rating} />}
                        </div>
                        {item.phone && <a href={`tel:${item.phone}`} className="shrink-0 text-xs font-mono text-nexo-sky hover:text-white transition-colors">{item.phone}</a>}
                      </div>
                      {item.description && <p className="text-xs text-nexo-dim mt-1.5 line-clamp-2 leading-relaxed">{item.description}</p>}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="text-[11px] font-mono text-nexo-faint hover:text-nexo-sky truncate max-w-xs transition-colors">
                            {item.domain ?? item.url}
                          </a>
                        )}
                        {item.booking_url && <a href={item.booking_url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice hover:text-nexo-ice transition-colors">Reservar ↗</a>}
                        {item.cid && <a href={`https://www.google.com/maps?cid=${item.cid}`} target="_blank" rel="noopener noreferrer" className="nexo-label hover:text-white transition-colors">Maps ↗</a>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {historyIndex.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {historyIndex.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <div key={entry.id} className={`flex items-center gap-2 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <a href={`/dashboard/local-finder?history_id=${entry.id}#results`} className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.keyword}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5 truncate">
                      {entry.location} · {entry.count} {entry.count === 1 ? 'resultado' : 'resultados'}
                      {entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}
                    </p>
                  </a>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-nexo-faint">{formatDate(entry.ts)}</span>
                    <a href={lfRerunUrl(entry)} className="text-[10px] font-medium uppercase tracking-widest text-nexo-ice hover:text-nexo-ice transition-colors" title="Executar novamente">Executar de novo ↻</a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default withProjectScope(LocalFinderPage);
