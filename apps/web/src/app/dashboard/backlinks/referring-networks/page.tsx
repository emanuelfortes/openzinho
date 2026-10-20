import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getBlRefNetHistory, saveBlRefNet, getBlRefNetResults, type BlRefNetEntry } from '@/lib/db';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import ReferringNetworksTable, { type NetworkItem } from './ReferringNetworksTable';

interface SearchParams { target?: string; history_id?: string; }

async function fetchNetworks(target: string, login: string, pass: string): Promise<{ items: NetworkItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: NetworkItem[] }>(
    'backlinks/referring_networks/live',
    { target, limit: 1000, order_by: ['referring_domains,desc'] },
    { login, pass },
  );
  if (error) return { items: [], error };
  return { items: result?.items ?? [], cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function ReferringNetworksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const rawTarget = params.target?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const historyId = params.history_id;

  let items: NetworkItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlRefNetEntry | null = null;

  if (historyId) {
    const saved = getBlRefNetResults<NetworkItem>(historyId);
    if (saved) { items = saved; activeEntry = getBlRefNetHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget) {
    const dedupeId = stableSearchId(['bl-ref-networks', rawTarget]);
    const cached = getBlRefNetResults<NetworkItem>(dedupeId);
    if (cached) {
      items = cached;
      const cachedEntry = getBlRefNetHistory().find((e) => e.id === dedupeId);
      cost = cachedEntry?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchNetworks(rawTarget, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlRefNetEntry = { id: dedupeId, ts: Date.now(), target: rawTarget, count: items.length, cost };
        saveBlRefNet(entry, items);
      }
    }
  }

  const history = getBlRefNetHistory();
  const displayTarget = activeEntry?.target ?? rawTarget;

  const csvData = items.map((item) => ({
    network: item.network_address ?? '',
    ip_count: item.ip_count ?? '',
    referring_domains: item.referring_domains ?? '',
    backlinks: item.backlinks ?? '',
    rank: item.rank ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Referring Networks</span>
        </div>
        <h1 className="nexo-h1">Referring Networks</h1>
        <p className="text-sm text-nexo-faint mt-1">IP subnets and networks sending backlinks to a domain.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Analyze" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div>
          <label className="nexo-label block mb-1.5">Domain</label>
          <input type="text" name="target" defaultValue={displayTarget || defaultDomain} placeholder="example.com" required
            className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || rawTarget) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <span className="nexo-label">{items.length} networks — {displayTarget}</span>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <CopyMarkdownButton data={csvData} columns={[{key:'network',label:'Network'},{key:'ip_count',label:'IPs'},{key:'referring_domains',label:'Ref. Domains'},{key:'backlinks',label:'Backlinks'},{key:'rank',label:'Rank'}]} />
                  <ExportCSVButton data={csvData} filename={`referring-networks-${displayTarget}.csv`} columns={[{key:'network',label:'Network'},{key:'ip_count',label:'IPs'},{key:'referring_domains',label:'Ref. Domains'},{key:'backlinks',label:'Backlinks'},{key:'rank',label:'Rank'}]} />
                </div>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">No networks found.</div>
          ) : (
            <ReferringNetworksTable items={items} />
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">History</h2>
          </div>
          <div className="divide-y divide-nexo-border">
            {history.map((entry) => {
              const isActive = entry.id === historyId;
              return (
                <a key={entry.id} href={`/dashboard/backlinks/referring-networks?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>{entry.target}</p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} networks{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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

export default withProjectScope(ReferringNetworksPage);
