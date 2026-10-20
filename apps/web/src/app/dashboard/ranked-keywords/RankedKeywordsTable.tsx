'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { RankedKwItem } from './page';

type SortKey = 'position' | 'keyword' | 'volume' | 'kd' | 'intent' | 'cpc';
type SortDir = 'asc' | 'desc';

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-nexo-faint">—</span>;
  const color =
    value >= 70 ? 'text-nexo-danger-text bg-nexo-danger/10' :
    value >= 40 ? 'text-nexo-warn-text bg-nexo-warn/10' :
    'text-nexo-ice bg-nexo-ice/10';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium tabular-nums ${color}`}>{value}</span>;
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-nexo-faint">—</span>;
  const map: Record<string, string> = {
    informational: 'text-nexo-sky bg-nexo-blue/10',
    navigational: 'text-nexo-sky bg-nexo-blue/10',
    transactional: 'text-nexo-ice bg-nexo-ice/10',
    commercial: 'text-nexo-warn-text bg-nexo-warn/10',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${map[value] ?? 'text-nexo-dim bg-nexo-surface-2'}`}>
      {value.slice(0, 4)}
    </span>
  );
}

function PositionBadge({ pos }: { pos?: number }) {
  if (!pos) return <span className="text-nexo-faint">—</span>;
  const color =
    pos <= 3 ? 'bg-nexo-ice text-nexo-bg' :
    pos <= 10 ? 'bg-nexo-blue text-white' :
    pos <= 20 ? 'bg-nexo-surface-2 text-white' :
    'bg-nexo-surface-2 text-nexo-dim';
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-nexo text-xs font-medium ${color}`}>
      {pos}
    </span>
  );
}

function sortValue(item: RankedKwItem, key: SortKey): number | string {
  switch (key) {
    case 'position': return item.ranked_serp_element?.serp_item?.rank_group ?? Number.MAX_SAFE_INTEGER;
    case 'keyword': return item.keyword_data?.keyword?.toLowerCase() ?? '';
    case 'volume': return item.keyword_data?.keyword_info?.search_volume ?? -1;
    case 'kd': return item.keyword_data?.keyword_properties?.keyword_difficulty ?? -1;
    case 'intent': return item.keyword_data?.search_intent_info?.main_intent ?? '';
    case 'cpc': return item.keyword_data?.keyword_info?.cpc ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function RankedKeywordsTable({ items }: { items: RankedKwItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'position' ? 'asc' : 'desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nexo-border bg-white/[0.02]">
            <Header label="Pos." sortK="position" align="center" className="w-12" />
            <Header label="Keyword" sortK="keyword" align="left" />
            <th className="nexo-label px-4 py-3 text-left hidden lg:table-cell">URL</th>
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Intent" sortK="intent" align="center" className="hidden sm:table-cell" />
            <Header label="CPC" sortK="cpc" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const kw = item.keyword_data;
            const serp = item.ranked_serp_element?.serp_item;
            const pos = serp?.rank_group;
            const url = serp?.url ?? '';
            let urlDisplay = '';
            try {
              const u = new URL(url);
              urlDisplay = u.pathname === '/' ? u.hostname : u.pathname;
            } catch { urlDisplay = url; }

            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-4 py-3 text-center">
                  <PositionBadge pos={pos} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-nexo-text">{kw?.keyword ?? '—'}</span>
                    {serp?.is_featured_snippet && (
                      <span className="text-[9px] font-medium uppercase tracking-widest text-nexo-warn-text bg-nexo-warn/10 border border-nexo-warn/40 px-1.5 py-0.5 rounded shrink-0">featured</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  {url ? (
                    <a href={url} target="_blank" rel="noopener noreferrer"
                      className="text-[11px] font-mono text-nexo-faint hover:text-nexo-sky truncate max-w-[200px] block transition-colors">
                      {urlDisplay}
                    </a>
                  ) : <span className="text-nexo-faint">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">
                  {kw?.keyword_info?.search_volume?.toLocaleString('en-GB') ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <DifficultyBadge value={kw?.keyword_properties?.keyword_difficulty} />
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <IntentBadge value={kw?.search_intent_info?.main_intent} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden md:table-cell">
                  {kw?.keyword_info?.cpc != null ? `$${kw.keyword_info.cpc.toFixed(2)}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
