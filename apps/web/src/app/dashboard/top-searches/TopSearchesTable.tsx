'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface MonthlySearch {
  year: number;
  month: number;
  search_volume: number;
}

interface TopSearchItem {
  keyword: string;
  keyword_info?: {
    search_volume?: number;
    cpc?: number;
    competition?: number;
    competition_level?: string;
    monthly_searches?: MonthlySearch[];
  };
  keyword_properties?: {
    keyword_difficulty?: number;
    word_count?: number;
    detected_language?: string;
  };
  search_intent_info?: {
    main_intent?: string;
  };
  avg_backlinks_info?: {
    referring_domains?: number;
  };
}

type SortKey = 'keyword' | 'kd' | 'volume' | 'cpc' | 'intent' | 'competition' | 'ref_domains';
type SortDir = 'asc' | 'desc';

function DifficultyBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-nexo-faint text-xs">—</span>;
  const color = value >= 70 ? 'bg-nexo-danger/10 text-nexo-danger-text'
    : value >= 50 ? 'bg-nexo-warn/10 text-nexo-warn-text'
    : value >= 30 ? 'bg-nexo-warn/10 text-nexo-warn-text'
    : 'bg-nexo-ice/10 text-nexo-ice';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-medium ${color}`}>{value}</span>;
}

const INTENT_SHORT: Record<string, string> = { informational: 'info', navigational: 'naveg', commercial: 'comer', transactional: 'trans' };
const COMPETITION_LABELS: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return <span className="text-nexo-faint text-xs">—</span>;
  const map: Record<string, string> = {
    informational: 'bg-nexo-blue/10 text-nexo-sky',
    navigational: 'bg-nexo-blue/10 text-nexo-sky',
    commercial: 'bg-nexo-warn/10 text-nexo-warn-text',
    transactional: 'bg-nexo-ice/10 text-nexo-ice',
  };
  const cls = map[intent] ?? 'bg-nexo-surface-2 text-nexo-dim';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${cls}`}>{INTENT_SHORT[intent] ?? intent.slice(0, 5)}</span>;
}

function TrendSparkline({ monthly }: { monthly?: MonthlySearch[] }) {
  if (!monthly || monthly.length === 0) return <span className="text-nexo-faint text-xs">—</span>;
  const sorted = [...monthly].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  const values = sorted.map((m) => m.search_volume);
  const max = Math.max(...values, 1);
  const w = 60, h = 20;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="inline-block align-middle">
      <polyline points={pts} fill="none" stroke="#4da2ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('pt-BR');
}

function sortValue(item: TopSearchItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'kd': return item.keyword_properties?.keyword_difficulty ?? -1;
    case 'volume': return item.keyword_info?.search_volume ?? -1;
    case 'cpc': return item.keyword_info?.cpc ?? -1;
    case 'intent': return item.search_intent_info?.main_intent ?? '';
    case 'competition': return item.keyword_info?.competition ?? -1;
    case 'ref_domains': return item.avg_backlinks_info?.referring_domains ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function TopSearchesTable({ items }: { items: TopSearchItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('volume');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
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
            <th className="nexo-label px-6 py-3 text-left">#</th>
            <Header label="Palavra-chave" sortK="keyword" align="left" />
            <Header label="KD" sortK="kd" align="center" />
            <Header label="Vol." sortK="volume" align="right" />
            <Header label="CPC" sortK="cpc" align="right" />
            <Header label="Intenção" sortK="intent" align="center" className="hidden sm:table-cell" />
            <Header label="Comp." sortK="competition" align="center" className="hidden md:table-cell" />
            <Header label="Dom. ref." sortK="ref_domains" align="right" className="hidden lg:table-cell" />
            <th className="nexo-label px-4 py-3 text-right hidden xl:table-cell">Tendência</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const ki = item.keyword_info;
            const kp = item.keyword_properties;
            const compLevel = ki?.competition_level;
            const compColor = compLevel === 'HIGH' ? 'text-nexo-danger-text bg-nexo-danger/10'
              : compLevel === 'MEDIUM' ? 'text-nexo-warn-text bg-nexo-warn/10'
              : compLevel === 'LOW' ? 'text-nexo-ice bg-nexo-ice/10'
              : 'text-nexo-faint bg-nexo-surface-2';
            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-6 py-3 text-[11px] font-mono text-nexo-faint tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-nexo-text max-w-[220px]">
                  <span className="truncate block">{item.keyword}</span>
                  {kp?.word_count !== undefined && (
                    <span className="text-[10px] text-nexo-faint">{kp.word_count} {kp.word_count !== 1 ? 'palavras' : 'palavra'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <DifficultyBadge value={kp?.keyword_difficulty} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">
                  {fmt(ki?.search_volume)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">
                  {ki?.cpc != null ? `US$ ${ki.cpc.toFixed(2).replace('.', ',')}` : '—'}
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <IntentBadge intent={item.search_intent_info?.main_intent} />
                </td>
                <td className="px-4 py-3 text-center hidden md:table-cell">
                  {compLevel ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${compColor}`}>
                      {COMPETITION_LABELS[compLevel] ?? compLevel}
                    </span>
                  ) : <span className="text-nexo-faint text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden lg:table-cell">
                  {fmt(item.avg_backlinks_info?.referring_domains)}
                </td>
                <td className="px-4 py-3 text-right hidden xl:table-cell">
                  <TrendSparkline monthly={ki?.monthly_searches} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
