'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface BulkBlItem {
  target?: string;
  backlinks?: number;
}

type SortKey = 'target' | 'backlinks';
type SortDir = 'asc' | 'desc';

function fmt(n?: number) { return n != null ? n.toLocaleString('pt-BR') : '—'; }

function sortValue(item: BulkBlItem, key: SortKey): number | string {
  switch (key) {
    case 'target': return item.target?.toLowerCase() ?? '';
    case 'backlinks': return item.backlinks ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function BulkBacklinksTable({ items }: { items: BulkBlItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('backlinks');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const maxBl = Math.max(...items.map((i) => i.backlinks ?? 0), 1);

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

  function Header({ label, sortK, align }: { label: string; sortK: SortKey; align: 'left' | 'right' }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left !px-6' : 'text-right'}`}
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
            <Header label="Domínio" sortK="target" align="left" />
            <Header label="Backlinks" sortK="backlinks" align="left" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const share = Math.round(((item.backlinks ?? 0) / maxBl) * 100);
            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-6 py-3 font-mono text-sm text-nexo-text font-medium">{item.target ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-nexo-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-nexo-sky/40 rounded-full" style={{ width: `${share}%` }} />
                    </div>
                    <span className="text-xs font-mono font-medium text-nexo-text tabular-nums">{fmt(item.backlinks)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
