'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface SubdomainItem {
  subdomain?: string;
  metrics?: {
    organic?: {
      count?: number;
      etv?: number;
      estimated_paid_traffic_cost?: number;
    };
  };
}

type SortKey = 'subdomain' | 'keywords' | 'traffic' | 'traffic_cost';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('pt-BR') : '—'; }

function sortValue(item: SubdomainItem, key: SortKey): number | string {
  const org = item.metrics?.organic;
  switch (key) {
    case 'subdomain': return item.subdomain?.toLowerCase() ?? '';
    case 'keywords': return org?.count ?? -1;
    case 'traffic': return org?.etv ?? -1;
    case 'traffic_cost': return org?.estimated_paid_traffic_cost ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function SubdomainsTable({ items }: { items: SubdomainItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('traffic');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxTraffic = Math.max(...items.map((i) => i.metrics?.organic?.etv ?? 0), 1);

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
            <Header label="Subdomínio" sortK="subdomain" align="left" className="!px-6" />
            <Header label="Palavras-chave" sortK="keywords" align="right" />
            <Header label="Tráfego" sortK="traffic" align="right" />
            <th className="nexo-label px-6 py-3 text-left hidden md:table-cell">Participação</th>
            <Header label="Valor do tráfego" sortK="traffic_cost" align="right" className="hidden lg:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const org = item.metrics?.organic;
            const etv = org?.etv ?? 0;
            const share = maxTraffic > 0 ? Math.round((etv / maxTraffic) * 100) : 0;
            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-6 py-3 font-mono text-sm text-nexo-sky max-w-[240px]">
                  <a href={`https://${item.subdomain}`} target="_blank" rel="noopener noreferrer" className="hover:underline truncate block">{item.subdomain ?? '—'}</a>
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">{fmt(org?.count)}</td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums font-medium">{fmt(Math.round(etv))}</td>
                <td className="px-6 py-3 hidden md:table-cell">
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-nexo-sky/40 rounded-full" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-[10px] text-nexo-faint tabular-nums">{share}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden lg:table-cell">
                  {org?.estimated_paid_traffic_cost != null ? `US$ ${Math.round(org.estimated_paid_traffic_cost).toLocaleString('pt-BR')}` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
