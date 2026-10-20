'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';

type TechCategories = Record<string, Record<string, string[]>>;

interface FindDomainItem {
  domain?: string;
  title?: string;
  description?: string;
  domain_rank?: number;
  country_iso_code?: string;
  last_visited?: string;
  technologies?: TechCategories;
}

type SortKey = 'dr' | 'domain' | 'title' | 'country' | 'last_seen';
type SortDir = 'asc' | 'desc';

function DrBadge({ value }: { value?: number }) {
  if (!value) return <span className="text-nexo-faint text-xs">—</span>;
  const color = value >= 70 ? 'bg-nexo-ice text-nexo-bg' : value >= 40 ? 'bg-nexo-blue text-white' : 'bg-nexo-surface-2 text-nexo-dim';
  return <span className={`inline-flex items-center justify-center w-9 h-5 rounded text-[10px] font-medium ${color}`}>{value}</span>;
}

function fmtVisited(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function sortValue(item: FindDomainItem, key: SortKey): number | string {
  switch (key) {
    case 'dr': return item.domain_rank ?? -1;
    case 'domain': return item.domain?.toLowerCase() ?? '';
    case 'title': return item.title?.toLowerCase() ?? '';
    case 'country': return item.country_iso_code ?? '';
    case 'last_seen': return item.last_visited ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function TechFindTable({ items }: { items: FindDomainItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('dr');
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
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((item) => ({
    dr: item.domain_rank ?? '',
    domain: item.domain ?? '',
    title: item.title ?? '',
    country: item.country_iso_code ?? '',
    last_seen: item.last_visited ? item.last_visited.split('T')[0] : '',
  }));

  return (
    <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
      <div className="px-6 py-4 border-b border-nexo-border flex items-center justify-between">
        <h2 className="nexo-label">Domínios encontrados</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-nexo-faint">{items.length} exibidos</span>
          <CopyMarkdownButton
            data={csvData}
            columns={[
              { key: 'dr', label: 'DR' },
              { key: 'domain', label: 'Domínio' },
              { key: 'title', label: 'Título' },
              { key: 'country', label: 'País' },
              { key: 'last_seen', label: 'Visto pela última vez' },
            ]}
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-nexo-border bg-white/[0.02]">
              <Header label="DR" sortK="dr" align="center" className="w-14" />
              <Header label="Domínio" sortK="domain" align="left" />
              <Header label="Título" sortK="title" align="left" className="hidden md:table-cell" />
              <Header label="País" sortK="country" align="center" className="hidden sm:table-cell w-16" />
              <Header label="Visto pela última vez" sortK="last_seen" align="right" className="hidden lg:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {sorted.map((item, i) => (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-4 py-3 text-center"><DrBadge value={item.domain_rank} /></td>
                <td className="px-4 py-3">
                  <a href={`https://${item.domain}`} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono font-medium text-nexo-text hover:text-nexo-sky transition-colors">
                    {item.domain}
                  </a>
                  {item.technologies && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Array.from(
                        new Set(
                          Object.values(item.technologies).flatMap((subcats) => Object.values(subcats).flat()),
                        ),
                      )
                        .slice(0, 6)
                        .map((t) => (
                          <span key={t} className="text-[9px] font-medium bg-nexo-surface-2 text-nexo-dim px-1.5 py-0.5 rounded">{t}</span>
                        ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                  <span className="text-xs text-nexo-dim truncate block">{item.title ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-center hidden sm:table-cell">
                  <span className="text-[10px] font-medium text-nexo-faint uppercase">{item.country_iso_code ?? '—'}</span>
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className="text-[11px] text-nexo-faint tabular-nums">{fmtVisited(item.last_visited)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
