'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import ExportCSVButton from '@/components/ExportCSVButton';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

export interface IntersectionItem {
  keyword_data: {
    keyword: string;
    location_code: number;
    language_code: string;
    keyword_info?: {
      search_volume?: number;
      competition?: number;
      cpc?: number;
    };
    keyword_properties?: {
      keyword_difficulty?: number;
    };
  };
  first_domain_serp_element?: {
    rank_group?: number;
    rank_absolute?: number;
    url?: string;
  };
  second_domain_serp_element?: {
    rank_group?: number;
    rank_absolute?: number;
    url?: string;
  };
}

type SortKey = 'keyword' | 'volume' | 'kd' | 'pos1' | 'pos2';
type SortDir = 'asc' | 'desc';

function PosBadge({ pos }: { pos: number | undefined }) {
  if (!pos) return <span className="text-nexo-faint">—</span>;
  const cls = pos <= 3 ? 'text-nexo-ice font-medium' : pos <= 10 ? 'text-nexo-sky font-medium' : 'text-nexo-dim';
  return <span className={`font-mono tabular-nums text-xs ${cls}`}>#{pos}</span>;
}

function KdBadge({ kd }: { kd: number | undefined }) {
  if (kd === undefined) return <span className="text-nexo-faint">—</span>;
  const cls = kd >= 70 ? 'bg-nexo-danger/10 text-nexo-danger-text border-nexo-danger/40' : kd >= 40 ? 'bg-nexo-warn/10 text-nexo-warn-text border-nexo-warn/40' : 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30';
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>{kd}</span>;
}

function sortValue(item: IntersectionItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword_data.keyword.toLowerCase();
    case 'volume': return item.keyword_data.keyword_info?.search_volume ?? -1;
    case 'kd': return item.keyword_data.keyword_properties?.keyword_difficulty ?? -1;
    case 'pos1': return item.first_domain_serp_element?.rank_absolute ?? 1e9;
    case 'pos2': return item.second_domain_serp_element?.rank_absolute ?? 1e9;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function IntersectionTable({
  items, target1, target2,
}: { items: IntersectionItem[]; target1: string; target2: string }) {
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
      <th className={`px-3 py-3.5 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((i) => ({
    keyword: i.keyword_data.keyword,
    volume: i.keyword_data.keyword_info?.search_volume ?? '',
    kd: i.keyword_data.keyword_properties?.keyword_difficulty ?? '',
    pos_target1: i.first_domain_serp_element?.rank_absolute ?? '',
    pos_target2: i.second_domain_serp_element?.rank_absolute ?? '',
  }));

  const csvColumns = [
    { key: 'keyword', label: 'Palavra-chave' },
    { key: 'volume', label: 'Volume' },
    { key: 'kd', label: 'KD' },
    { key: 'pos_target1', label: `Pos ${target1}` },
    { key: 'pos_target2', label: `Pos ${target2}` },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <CopyMarkdownButton data={csvData} columns={csvColumns} />
        <ExportCSVButton data={csvData} filename={`intersection-${target1}-${target2}.csv`} columns={csvColumns} />
      </div>

      <div id="results" className="bg-nexo-surface border border-nexo-border rounded-nexo-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-nexo-border">
              <Header label="Palavra-chave" sortK="keyword" align="left" className="!px-5" />
              <Header label="Vol." sortK="volume" align="right" />
              <Header label="KD" sortK="kd" align="center" />
              <Header label="D1" sortK="pos1" align="center" className="!text-blue-400" />
              <Header label="D2" sortK="pos2" align="center" />
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {sorted.map((item, i) => (
              <tr key={i} className="hover:bg-white/[0.04]">
                <td className="px-5 py-3 font-medium text-nexo-text">{item.keyword_data.keyword}</td>
                <td className="px-3 py-3 text-right font-mono text-nexo-dim">
                  {(item.keyword_data.keyword_info?.search_volume ?? 0).toLocaleString('pt-BR')}
                </td>
                <td className="px-3 py-3 text-center">
                  <KdBadge kd={item.keyword_data.keyword_properties?.keyword_difficulty} />
                </td>
                <td className="px-3 py-3 text-center">
                  <PosBadge pos={item.first_domain_serp_element?.rank_absolute} />
                </td>
                <td className="px-3 py-3 text-center">
                  <PosBadge pos={item.second_domain_serp_element?.rank_absolute} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
