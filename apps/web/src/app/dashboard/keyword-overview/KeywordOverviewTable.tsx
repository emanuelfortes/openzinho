'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { KwOverviewItem } from './page';

type SortKey = 'keyword' | 'volume' | 'kd' | 'intent' | 'competition' | 'cpc';
type SortDir = 'asc' | 'desc';

const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const COMPETITION_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

function DifficultyBar({ value }: { value?: number }) {
  if (value === undefined) return <span className="text-nexo-faint">—</span>;
  const color = value >= 70 ? 'bg-nexo-danger' : value >= 40 ? 'bg-nexo-warn' : 'bg-nexo-ice';
  const textColor = value >= 70 ? 'text-nexo-danger-text' : value >= 40 ? 'text-nexo-warn-text' : 'text-nexo-ice';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-[11px] font-medium tabular-nums ${textColor}`}>{value}</span>
    </div>
  );
}

function IntentBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-nexo-faint">—</span>;
  const map: Record<string, string> = {
    informational: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
    navigational: 'text-nexo-sky bg-nexo-blue/10 border-nexo-border-strong',
    transactional: 'text-nexo-ice bg-nexo-ice/10 border-nexo-ice/30',
    commercial: 'text-nexo-warn-text bg-nexo-warn/10 border-nexo-warn/40',
  };
  const labels: Record<string, string> = {
    informational: 'Info',
    navigational: 'Nav',
    transactional: 'Transac',
    commercial: 'Commercial',
  };
  return (
    <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${map[value] ?? 'text-nexo-dim bg-nexo-surface-2 border-nexo-border'}`}>
      {labels[value] ?? value}
    </span>
  );
}

function CompetitionBadge({ level }: { level?: string }) {
  if (!level) return <span className="text-nexo-faint">—</span>;
  const map: Record<string, string> = {
    HIGH: 'text-nexo-danger-text bg-nexo-danger/10',
    MEDIUM: 'text-nexo-warn-text bg-nexo-warn/10',
    LOW: 'text-nexo-ice bg-nexo-ice/10',
  };
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium uppercase ${map[level] ?? 'text-nexo-dim bg-nexo-surface-2'}`}>{level}</span>;
}

interface MonthlySearch { year: number; month: number; search_volume: number }

function Sparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  const data = monthly?.slice(-12) ?? [];
  if (data.length === 0) return <span className="text-nexo-faint text-xs">—</span>;
  const max = Math.max(...data.map((m) => m.search_volume ?? 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-7" title={data.map((m) => `${MONTHS[m.month - 1]}: ${m.search_volume?.toLocaleString('en-GB')}`).join(' · ')}>
      {data.map((m, i) => (
        <div
          key={i}
          className="w-2 bg-nexo-sky/40 rounded-sm hover:bg-nexo-sky transition-colors"
          style={{ height: `${Math.max(2, Math.round(((m.search_volume ?? 0) / max) * 28))}px` }}
        />
      ))}
    </div>
  );
}

function sortValue(item: KwOverviewItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'volume': return item.keyword_info?.search_volume ?? -1;
    case 'kd': return item.keyword_properties?.keyword_difficulty ?? -1;
    case 'intent': return item.search_intent_info?.main_intent ?? '';
    case 'competition': return item.keyword_info?.competition_level ? COMPETITION_RANK[item.keyword_info.competition_level] ?? -1 : -1;
    case 'cpc': return item.keyword_info?.cpc ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function KeywordOverviewTable({ items }: { items: KwOverviewItem[] }) {
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
    else { setSortKey(key); setSortDir('desc'); }
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
            <Header label="Keyword" sortK="keyword" align="left" className="!px-6" />
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="Difficulty KD" sortK="kd" align="left" />
            <Header label="Intent" sortK="intent" align="center" />
            <Header label="Competition" sortK="competition" align="center" className="hidden sm:table-cell" />
            <Header label="CPC" sortK="cpc" align="right" className="hidden md:table-cell" />
            <th className="nexo-label px-4 py-3 text-left hidden xl:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-white/[0.04] transition-colors">
              <td className="px-6 py-3 font-medium text-nexo-text max-w-xs">{item.keyword ?? '—'}</td>
              <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">
                {item.keyword_info?.search_volume?.toLocaleString('en-GB') ?? '—'}
              </td>
              <td className="px-4 py-3">
                <DifficultyBar value={item.keyword_properties?.keyword_difficulty} />
              </td>
              <td className="px-4 py-3 text-center">
                <IntentBadge value={item.search_intent_info?.main_intent} />
              </td>
              <td className="px-4 py-3 text-center hidden sm:table-cell">
                <CompetitionBadge level={item.keyword_info?.competition_level} />
              </td>
              <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden md:table-cell">
                {item.keyword_info?.cpc != null ? `$${item.keyword_info.cpc.toFixed(2)}` : '—'}
              </td>
              <td className="px-4 py-3 hidden xl:table-cell">
                <Sparkline monthly={item.keyword_info?.monthly_searches} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
