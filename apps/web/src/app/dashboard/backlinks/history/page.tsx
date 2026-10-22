import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getBlHistHistory, saveBlHist, getBlHistResults, type BlHistEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import BacklinksHistoryTable from './BacklinksHistoryTable';

interface HistoryPoint {
  date?: string;
  backlinks?: number;
  new_backlinks?: number;
  lost_backlinks?: number;
  referring_domains?: number;
  new_referring_domains?: number;
  lost_referring_domains?: number;
  referring_main_domains?: number;
}

interface SearchParams { target?: string; history_id?: string; }

async function fetchHistory(target: string, login: string, pass: string): Promise<{ items: HistoryPoint[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: HistoryPoint[] }>(
    'backlinks/history/live', { target }, { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function fmt(n?: number) { return n != null ? n.toLocaleString('pt-BR') : '—'; }
function formatDate(ts: number) { return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }); }

function SparkChart({ points, key1, key2, color1, color2 }: {
  points: HistoryPoint[];
  key1: keyof HistoryPoint;
  key2?: keyof HistoryPoint;
  color1: string;
  color2?: string;
}) {
  const vals1 = points.map((p) => (p[key1] as number | undefined) ?? 0);
  const vals2 = key2 ? points.map((p) => (p[key2] as number | undefined) ?? 0) : [];
  const allVals = [...vals1, ...vals2].filter((v) => v > 0);
  if (allVals.length < 2) return <div className="h-24 flex items-center justify-center text-xs text-nexo-faint">Dados insuficientes</div>;

  const maxV = Math.max(...allVals);
  const minV = 0;
  const range = maxV - minV || 1;
  const W = 500, H = 80, PAD = { l: 0, r: 0, t: 8, b: 8 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const n = points.length;
  const toX = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * cW;
  const toY = (v: number) => PAD.t + (1 - (v - minV) / range) * cH;

  const makePath = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
      <path d={makePath(vals1)} fill="none" stroke={color1} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {vals2.length > 0 && <path d={makePath(vals2)} fill="none" stroke={color2} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />}
      <circle cx={toX(n - 1)} cy={toY(vals1[n - 1])} r="3" fill={color1} />
    </svg>
  );
}

async function BacklinksHistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const historyId = params.history_id;

  let items: HistoryPoint[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlHistEntry | null = null;

  if (historyId) {
    const saved = getBlHistResults<HistoryPoint>(historyId);
    if (saved) { items = saved; activeEntry = getBlHistHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Esta busca não está mais disponível.';
  } else if (rawTarget) {
    const dedupeId = stableSearchId(['backlinks-history', rawTarget]);
    const cached = getBlHistResults<HistoryPoint>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlHistHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'Credenciais do DataForSEO ausentes. Configure-as em Configurações.'; }
    else {
      const result = await fetchHistory(rawTarget, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlHistEntry = { id: dedupeId, ts: Date.now(), target: rawTarget, count: items.length, cost };
        saveBlHist(entry, items);
      }
    }
  }

  const searchHistory = getBlHistHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;
  const sorted = [...items].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const latest = sorted[sorted.length - 1];

  const csvData = sorted.map((p) => ({
    date: p.date ?? '',
    backlinks: p.backlinks ?? '',
    new_backlinks: p.new_backlinks ?? '',
    lost_backlinks: p.lost_backlinks ?? '',
    referring_domains: p.referring_domains ?? '',
    new_referring_domains: p.new_referring_domains ?? '',
    lost_referring_domains: p.lost_referring_domains ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Histórico</span>
        </div>
        <h1 className="nexo-h1">Histórico de backlinks</h1>
        <p className="text-sm text-nexo-faint mt-1">Evolução mensal de backlinks e domínios de referência ao longo do tempo.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Carregar histórico" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div>
          <label className="nexo-label block mb-1.5">Domínio</label>
          <input type="text" name="target" defaultValue={displayTarget || defaultDomain} placeholder="example.com" required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && sorted.length > 0 && (
        <div className="space-y-4">
          {/* KPI snapshot */}
          {latest && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Backlinks', value: fmt(latest.backlinks) },
                { label: 'Domínios de ref.', value: fmt(latest.referring_domains) },
                { label: 'Novos (último período)', value: fmt(latest.new_backlinks), accent: 'bg-nexo-ice/10 border-nexo-ice/30' },
                { label: 'Perdidos (último período)', value: fmt(latest.lost_backlinks), accent: latest.lost_backlinks ? 'bg-nexo-danger/10 border-nexo-danger/40' : undefined },
              ].map((card) => (
                <div key={card.label} className={`rounded-nexo-lg border px-4 py-3 ${card.accent ?? 'bg-white/[0.02] border-nexo-border'}`}>
                  <p className="nexo-label mb-1">{card.label}</p>
                  <p className="text-lg font-medium text-nexo-text">{card.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
              <p className="nexo-label mb-3">Backlinks ao longo do tempo</p>
              <SparkChart points={sorted} key1="backlinks" color1="#4da2ff" />
              <div className="flex gap-4 mt-3 text-[10px] text-nexo-faint">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-nexo-sky rounded" /> Total</span>
              </div>
            </div>
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
              <p className="nexo-label mb-3">Domínios de referência ao longo do tempo</p>
              <SparkChart points={sorted} key1="referring_domains" color1="#c2e0ff" />
            </div>
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
              <p className="nexo-label mb-3">Backlinks novos vs. perdidos</p>
              <SparkChart points={sorted} key1="new_backlinks" key2="lost_backlinks" color1="#c2e0ff" color2="#fca5a5" />
              <div className="flex gap-4 mt-3 text-[10px] text-nexo-faint">
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-nexo-ice rounded" /> Novos</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5 bg-nexo-danger-text rounded border-dashed" /> Perdidos</span>
              </div>
            </div>
            <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-5">
              <p className="nexo-label mb-3">Domínios de referência novos vs. perdidos</p>
              <SparkChart points={sorted} key1="new_referring_domains" key2="lost_referring_domains" color1="#c2e0ff" color2="#fca5a5" />
            </div>
          </div>

          {/* Table */}
          <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
            <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
              <span className="nexo-label">{sorted.length} {sorted.length === 1 ? 'ponto de dados' : 'pontos de dados'}</span>
              <div className="flex items-center gap-3">
                {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">custo: US$ {cost.toFixed(4).replace('.', ',')}</span>}
                <CopyMarkdownButton data={csvData} columns={[{key:'date',label:'Data'},{key:'backlinks',label:'Backlinks'},{key:'new_backlinks',label:'Novos'},{key:'lost_backlinks',label:'Perdidos'},{key:'referring_domains',label:'Domínios de ref.'},{key:'new_referring_domains',label:'Novos domínios de ref.'},{key:'lost_referring_domains',label:'Domínios de ref. perdidos'}]} />
                <ExportCSVButton data={csvData} filename={`backlinks-history-${displayTarget}.csv`} columns={[{key:'date',label:'Data'},{key:'backlinks',label:'Backlinks'},{key:'new_backlinks',label:'Novos'},{key:'lost_backlinks',label:'Perdidos'},{key:'referring_domains',label:'Domínios de ref.'},{key:'new_referring_domains',label:'Novos domínios de ref.'},{key:'lost_referring_domains',label:'Domínios de ref. perdidos'}]} />
              </div>
            </div>
            <BacklinksHistoryTable points={sorted} />
          </div>
        </div>
      )}

      {searchHistory.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Histórico</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {searchHistory.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/backlinks/history?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} {entry.count === 1 ? 'ponto de dados' : 'pontos de dados'}{entry.cost !== undefined ? ` · US$ ${entry.cost.toFixed(4).replace('.', ',')}` : ''}</p>
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

export default withProjectScope(BacklinksHistoryPage);
