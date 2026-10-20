'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { BacklinkItem } from './page';

type SortKey = 'dr' | 'source' | 'anchor' | 'type' | 'seen';
type SortDir = 'asc' | 'desc';

function DRBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-nexo-faint text-xs">—</span>;
  const color = value >= 70 ? 'bg-nexo-ice text-nexo-bg' : value >= 40 ? 'bg-nexo-blue text-white' : 'bg-nexo-surface-2 text-nexo-dim';
  return <span className={`inline-flex items-center justify-center w-8 h-5 rounded text-[10px] font-medium ${color}`}>{value}</span>;
}

function formatSeenDate(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function sortValue(item: BacklinkItem, key: SortKey): number | string {
  switch (key) {
    case 'dr': return item.domain_from_rank ?? -1;
    case 'source': return item.domain_from?.toLowerCase() ?? '';
    case 'anchor': return item.anchor?.toLowerCase() ?? '';
    case 'type': return item.type?.toLowerCase() ?? '';
    case 'seen': return item.first_seen ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function BacklinksTable({ links }: { links: BacklinkItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('dr');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...links].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [links, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className, width }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string; width?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${width ?? ''} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${align === 'center' ? 'justify-center' : ''}`}>
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
            <Header label="DR" sortK="dr" align="center" width="w-12" />
            <Header label="Página de origem" sortK="source" align="left" />
            <Header label="Âncora" sortK="anchor" align="left" />
            <th className="nexo-label px-4 py-3 text-left hidden lg:table-cell">Página de destino</th>
            <Header label="Tipo" sortK="type" align="center" className="hidden sm:table-cell" />
            <Header label="Visto em" sortK="seen" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((link, i) => {
            const isBroken = link.is_broken;
            return (
              <tr key={i} className={`hover:bg-white/[0.04] transition-colors ${isBroken ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-center">
                  <DRBadge value={link.domain_from_rank} />
                </td>
                <td className="px-4 py-3 max-w-[220px]">
                  <a href={link.url_from} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-nexo-dim hover:text-nexo-sky transition-colors truncate block">
                    {link.url_from}
                  </a>
                  <span className="text-[10px] text-nexo-faint">{link.domain_from}</span>
                </td>
                <td className="px-4 py-3 max-w-[160px]">
                  <div className="flex items-center gap-1.5">
                    {link.anchor ? (
                      <span className="text-xs text-nexo-text font-medium truncate">{link.anchor}</span>
                    ) : link.image_url ? (
                      <span className="text-[10px] text-nexo-faint italic">Imagem</span>
                    ) : (
                      <span className="text-nexo-faint text-xs">—</span>
                    )}
                    <span className={`shrink-0 text-[9px] font-medium uppercase px-1.5 py-0.5 rounded ${link.dofollow ? 'text-nexo-ice bg-nexo-ice/10' : 'text-nexo-faint bg-nexo-surface-2'}`}>
                      {link.dofollow ? 'do' : 'no'}
                    </span>
                    {isBroken && <span className="shrink-0 text-[9px] font-medium uppercase px-1.5 py-0.5 rounded text-nexo-danger-text bg-nexo-danger/10">quebrado</span>}
                  </div>
                </td>
                <td className="px-4 py-3 max-w-[200px] hidden lg:table-cell">
                  <a href={link.url_to} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-nexo-dim hover:text-nexo-sky transition-colors truncate block">
                    {link.url_to}
                  </a>
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="text-[10px] text-nexo-faint bg-nexo-surface-2 px-1.5 py-0.5 rounded font-mono">{link.type ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  <span className="text-[11px] text-nexo-faint tabular-nums">{formatSeenDate(link.first_seen)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
