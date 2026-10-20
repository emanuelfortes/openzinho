import { withProjectScope } from '@/lib/db';
import { getCredentials, getSetting, getBlDomIntHistory, saveBlDomInt, getBlDomIntResults, type BlDomIntEntry } from '@/lib/db';
import { stableSearchId } from '@/lib/dedupe';
import { callDataForSeoFirst } from '@/lib/dataforseo';
import SearchForm from '@/components/SearchForm';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import DomainIntersectionTable from './DomainIntersectionTable';

interface DomIntItem {
  domain_from?: string;
  domain_from_rank?: number;
  backlinks_from_target1?: number;
  backlinks_from_target2?: number;
  first_seen?: string;
}

interface DomIntTargetData { target?: string; rank?: number; backlinks?: number; first_seen?: string | null; }
interface DomIntApiItem { domain_intersection?: Record<string, DomIntTargetData | undefined>; }

interface SearchParams { target1?: string; target2?: string; history_id?: string; }

async function fetchDomInt(target1: string, target2: string, login: string, pass: string): Promise<{ items: DomIntItem[]; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeoFirst<{ items?: DomIntApiItem[] }>(
    'backlinks/domain_intersection/live',
    { targets: { '1': target1, '2': target2 }, limit: 500, order_by: ['1.rank,desc'] },
    { login, pass },
  );
  if (error) return { items: [], error };
  // Each item holds per-target stats for the same referring domain, keyed by target index
  const items = (result?.items ?? []).map((item): DomIntItem => {
    const d1 = item.domain_intersection?.['1'];
    const d2 = item.domain_intersection?.['2'];
    const firstSeen = [d1?.first_seen, d2?.first_seen].filter((s): s is string => !!s).sort()[0];
    return {
      domain_from: d1?.target ?? d2?.target,
      domain_from_rank: d1?.rank ?? d2?.rank,
      backlinks_from_target1: d1?.backlinks,
      backlinks_from_target2: d2?.backlinks,
      first_seen: firstSeen,
    };
  });
  return { items, cost };
}

function formatDate(ts: number) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }

async function DomainIntersectionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const creds = getCredentials();
  const params = await searchParams;
  const defaultDomain = getSetting('default_domain') ?? '';
  const rawTarget1 = params.target1?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const rawTarget2 = params.target2?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '') ?? '';
  const historyId = params.history_id;

  let items: DomIntItem[] = [];
  let cost: number | undefined;
  let error: string | null = null;
  let activeEntry: BlDomIntEntry | null = null;

  if (historyId) {
    const saved = getBlDomIntResults<DomIntItem>(historyId);
    if (saved) { items = saved; activeEntry = getBlDomIntHistory().find((e) => e.id === historyId) ?? null; }
    else error = 'Search no longer available.';
  } else if (rawTarget1 && rawTarget2) {
    const dedupeId = stableSearchId(['bl-domain-intersection', rawTarget1, rawTarget2]);
    const cached = getBlDomIntResults<DomIntItem>(dedupeId);
    if (cached) {
      items = cached;
      cost = getBlDomIntHistory().find((e) => e.id === dedupeId)?.cost;
    } else if (!creds) { error = 'DataForSEO credentials missing. Configure them in Settings.'; }
    else {
      const result = await fetchDomInt(rawTarget1, rawTarget2, creds.login, creds.pass);
      items = result.items; cost = result.cost; error = result.error ?? null;
      if (!error && items.length > 0) {
        const entry: BlDomIntEntry = { id: dedupeId, ts: Date.now(), target1: rawTarget1, target2: rawTarget2, count: items.length, cost };
        saveBlDomInt(entry, items);
      }
    }
  }

  const history = getBlDomIntHistory();
  const t1 = activeEntry?.target1 ?? rawTarget1;
  const t2 = activeEntry?.target2 ?? rawTarget2;

  const csvData = items.map((item) => ({
    domain_from: item.domain_from ?? '',
    domain_from_rank: item.domain_from_rank ?? '',
    backlinks_to_target1: item.backlinks_from_target1 ?? '',
    backlinks_to_target2: item.backlinks_from_target2 ?? '',
    first_seen: item.first_seen ?? '',
  }));

  return (
    <div className="space-y-6">
      <div>
        <div className="nexo-label flex items-center gap-2 mb-1">
          <a href="/dashboard/backlinks" className="hover:text-white transition-colors">Backlinks</a>
          <span className="text-nexo-text">/</span>
          <span className="text-nexo-dim">Domain Intersection</span>
        </div>
        <h1 className="nexo-h1">Domain Intersection</h1>
        <p className="text-sm text-nexo-faint mt-1">Domains that link to both your site and a competitor simultaneously.</p>
      </div>

      <SearchForm className="bg-nexo-surface rounded-nexo-lg border border-nexo-border p-6 space-y-4" btnLabel="Compare" btnClassName="nexo-label w-full bg-white text-nexo-bg py-3 rounded-nexo-lg hover:bg-nexo-ice transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="nexo-label block mb-1.5">Your domain</label>
            <input type="text" name="target1" defaultValue={t1 || defaultDomain} placeholder="yourdomain.com" required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
          </div>
          <div>
            <label className="nexo-label block mb-1.5">Competitor domain</label>
            <input type="text" name="target2" defaultValue={t2} placeholder="competitor.com" required
              className="nexo-input min-w-0 w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-sky font-mono" />
          </div>
        </div>
      </SearchForm>

      {error && <div className="bg-nexo-danger/10 border border-nexo-danger/40 text-nexo-danger-text text-sm rounded-nexo-lg px-4 py-3">{error}</div>}

      {(historyId || (rawTarget1 && rawTarget2)) && !error && (
        <div id="results" className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
          <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="nexo-label">{items.length} shared linking domains</span>
              {t1 && t2 && (
                <span className="text-[11px] text-nexo-faint">
                  <span className="font-mono text-nexo-sky">{t1}</span> ∩ <span className="font-mono text-nexo-sky">{t2}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {cost !== undefined && <span className="text-[10px] font-mono text-nexo-faint">cost: ${cost.toFixed(4)}</span>}
              {items.length > 0 && <CopyMarkdownButton data={csvData} columns={[{key:'domain_from',label:'Linking Domain'},{key:'domain_from_rank',label:'DR'},{key:'backlinks_to_target1',label:`BL → ${t1}`},{key:'backlinks_to_target2',label:`BL → ${t2}`},{key:'first_seen',label:'First Seen'}]} />}
              {items.length > 0 && <ExportCSVButton data={csvData} filename={`domain-intersection-${t1}-${t2}.csv`} columns={[{key:'domain_from',label:'Linking Domain'},{key:'domain_from_rank',label:'DR'},{key:'backlinks_to_target1',label:`BL → ${t1}`},{key:'backlinks_to_target2',label:`BL → ${t2}`},{key:'first_seen',label:'First Seen'}]} />}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-nexo-faint">No common linking domains found.</div>
          ) : (
            <DomainIntersectionTable items={items} t1={t1} t2={t2} />
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
                <a key={entry.id} href={`/dashboard/backlinks/domain-intersection?history_id=${entry.id}#results`}
                  className={`flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.04] transition-colors ${isActive ? 'bg-nexo-blue/10' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-mono truncate ${isActive ? 'text-nexo-sky' : 'text-nexo-text'}`}>
                      {entry.target1} ∩ {entry.target2}
                    </p>
                    <p className="text-[11px] text-nexo-faint mt-0.5">{entry.count} common domains{entry.cost !== undefined ? ` · $${entry.cost.toFixed(4)}` : ''}</p>
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

export default withProjectScope(DomainIntersectionPage);
