'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface KwDensityItem {
  keyword?: string;
  frequency?: number;
  density?: number;
  url_count?: number;
  emphasized_keyword_frequency?: number;
}

type SortKey = 'keyword' | 'frequency' | 'density' | 'pages' | 'emphasized';
type SortDir = 'asc' | 'desc';

function sortValue(item: KwDensityItem, key: SortKey): number | string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'frequency': return item.frequency ?? -1;
    case 'density': return item.density ?? -1;
    case 'pages': return item.url_count ?? -1;
    case 'emphasized': return item.emphasized_keyword_frequency ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function KeywordDensityTable({ items }: { items: KwDensityItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('frequency');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : 'text-right'} ${className ?? ''}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => ({
    keyword: item.keyword ?? '',
    frequency: item.frequency ?? '',
    density: item.density != null ? `${item.density.toFixed(2)}%` : '',
    pages: item.url_count ?? '',
    emphasized: item.emphasized_keyword_frequency ?? '',
  }));
  const columns = [
    { key: 'keyword', label: 'Palavra-chave' },
    { key: 'frequency', label: 'Frequência' },
    { key: 'density', label: 'Densidade' },
    { key: 'pages', label: 'Páginas' },
    { key: 'emphasized', label: 'Em destaque' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-nexo-border flex items-center justify-end gap-2">
        <CopyMarkdownButton data={csvData} columns={columns} />
        <ExportCSVButton data={csvData} filename="keyword-density.csv" columns={columns} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-nexo-border bg-white/[0.02]">
              <th className="nexo-label px-4 py-3 text-left">#</th>
              <Header label="Palavra-chave" sortK="keyword" align="left" />
              <Header label="Frequência" sortK="frequency" align="right" />
              <Header label="Densidade" sortK="density" align="right" />
              <Header label="Páginas" sortK="pages" align="right" className="hidden sm:table-cell" />
              <Header label="Em destaque" sortK="emphasized" align="right" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {sorted.map((item, i) => {
              const density = item.density ?? 0;
              const densityCls = density >= 3 ? 'text-nexo-danger-text' : density >= 1.5 ? 'text-nexo-warn-text' : 'text-nexo-dim';
              return (
                <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                  <td className="px-4 py-2.5 text-[11px] font-mono text-nexo-faint tabular-nums">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-sm font-medium text-nexo-text">{item.keyword ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium text-nexo-dim tabular-nums">{item.frequency ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-medium tabular-nums ${densityCls}`}>
                    {item.density !== undefined ? `${item.density.toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-nexo-dim tabular-nums hidden sm:table-cell">{item.url_count ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-nexo-faint tabular-nums hidden lg:table-cell">{item.emphasized_keyword_frequency ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
