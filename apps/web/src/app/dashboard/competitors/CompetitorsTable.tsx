'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { CompetitorItem } from './page';

type SortKey = 'domain' | 'intersections' | 'avg_position' | 'traffic' | 'total_kw';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('pt-BR');
}

function n(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace('.', ',')} mil`;
  return String(v);
}

function TrafficBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-nexo-faint">—</span>;
  const color = value >= 10000 ? 'text-nexo-ice bg-nexo-ice/10'
    : value >= 1000 ? 'text-nexo-sky bg-nexo-blue/10'
    : 'text-nexo-dim bg-nexo-surface-2';
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium tabular-nums ${color}`}>{n(value)}</span>;
}

function sortValue(item: CompetitorItem, key: SortKey): number | string {
  switch (key) {
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'intersections': return item.intersections ?? -1;
    case 'avg_position': return item.avg_position ?? -1;
    case 'traffic': return item.metrics?.organic?.estimated_traffic ?? item.full_domain_metrics?.organic?.estimated_traffic ?? -1;
    case 'total_kw': return item.full_domain_metrics?.organic?.count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function CompetitorsTable({ items, maxIntersections }: { items: CompetitorItem[]; maxIntersections: number }) {
  const [sortKey, setSortKey] = useState<SortKey>('intersections');
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nexo-border bg-white/[0.02]">
            <th className="nexo-label px-5 py-3 text-center w-10">#</th>
            <Header label="Domínio concorrente" sortK="domain" align="left" />
            <Header label="Palavras-chave em comum" sortK="intersections" align="left" />
            <Header label="Pos. média" sortK="avg_position" align="right" />
            <Header label="Tráfego estimado" sortK="traffic" align="right" className="hidden sm:table-cell" />
            <Header label="Total de palavras-chave" sortK="total_kw" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const intersections = item.intersections ?? 0;
            const barPct = Math.round((intersections / maxIntersections) * 100);
            const traffic = item.metrics?.organic?.estimated_traffic;
            const totalKw = item.full_domain_metrics?.organic?.count;

            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-5 py-3 text-center">
                  <span className="w-7 h-7 rounded-nexo bg-nexo-surface-2 text-nexo-dim text-xs font-medium flex items-center justify-center mx-auto">
                    {i + 1}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`https://${item.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono font-medium text-nexo-text hover:text-nexo-sky transition-colors text-sm"
                  >
                    {item.domain}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-nexo-text tabular-nums w-10 shrink-0">{fmt(intersections)}</span>
                    <div className="flex-1 h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden min-w-[60px]">
                      <div className="h-full bg-nexo-sky/40 rounded-full" style={{ width: `${barPct}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">
                  {item.avg_position ? item.avg_position.toFixed(1).replace('.', ',') : '—'}
                </td>
                <td className="px-4 py-3 text-right hidden sm:table-cell">
                  <TrafficBadge value={traffic} />
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden md:table-cell">
                  {fmt(totalKw)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
