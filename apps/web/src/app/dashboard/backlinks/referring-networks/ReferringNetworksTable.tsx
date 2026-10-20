'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface NetworkItem {
  network_address?: string;
  ip_count?: number;
  referring_domains?: number;
  backlinks?: number;
  rank?: number;
}

type SortKey = 'network' | 'referring_domains' | 'ip_count' | 'backlinks';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('pt-BR') : '—'; }

function sortValue(item: NetworkItem, key: SortKey): number | string {
  switch (key) {
    case 'network': return item.network_address?.toLowerCase() ?? '';
    case 'referring_domains': return item.referring_domains ?? -1;
    case 'ip_count': return item.ip_count ?? -1;
    case 'backlinks': return item.backlinks ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function ReferringNetworksTable({ items }: { items: NetworkItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('referring_domains');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxDomains = Math.max(...items.map((i) => i.referring_domains ?? 0), 1);

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
            <th className="nexo-label px-6 py-3 text-left">#</th>
            <Header label="Rede" sortK="network" align="left" />
            <Header label="Domínios de ref." sortK="referring_domains" align="left" className="hidden md:table-cell" />
            <Header label="IPs" sortK="ip_count" align="right" />
            <Header label="Backlinks" sortK="backlinks" align="right" className="hidden sm:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const share = Math.round(((item.referring_domains ?? 0) / maxDomains) * 100);
            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-6 py-3 text-[11px] font-mono text-nexo-faint tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-mono text-sm text-nexo-text">{item.network_address ?? '—'}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-nexo-ice rounded-full" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-xs font-mono font-medium text-nexo-dim tabular-nums">{fmt(item.referring_domains)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">{fmt(item.ip_count)}</td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden sm:table-cell">{fmt(item.backlinks)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
