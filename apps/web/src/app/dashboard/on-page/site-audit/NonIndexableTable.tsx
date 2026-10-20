'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface NonIndexableItem {
  url?: string;
  reason?: string;
}

const REASONS: Record<string, string> = {
  robots_txt: 'Bloqueada pelo robots.txt',
  meta_tag: 'Meta tag noindex',
  http_header: 'Cabeçalho X-Robots-Tag',
  attribute: 'Atributo nofollow / noindex',
  too_many_redirects: 'Redirecionamentos demais',
};

function reasonLabel(reason?: string) {
  return reason ? REASONS[reason] ?? reason : '—';
}

type SortKey = 'url' | 'reason';
type SortDir = 'asc' | 'desc';

function sortValue(page: NonIndexableItem, key: SortKey): string {
  return key === 'url' ? page.url?.toLowerCase() ?? '' : reasonLabel(page.reason);
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function NonIndexableTable({ pages }: { pages: NonIndexableItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('reason');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [pages, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'center' ? 'justify-center w-full' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((page) => ({ url: page.url ?? '', reason: reasonLabel(page.reason) }));
  const columns = [
    { key: 'url', label: 'URL' },
    { key: 'reason', label: 'Motivo' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-nexo-border flex items-center justify-end gap-2">
        <CopyMarkdownButton data={csvData} columns={columns} />
        <ExportCSVButton data={csvData} filename="site-audit-non-indexable.csv" columns={columns} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-nexo-border bg-white/[0.02]">
              <th className="nexo-label px-4 py-3 text-left">#</th>
              <Header label="URL" sortK="url" align="left" />
              <Header label="Motivo" sortK="reason" align="left" />
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {sorted.map((page, i) => {
              const path = page.url ? (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })() : '—';
              return (
                <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                  <td className="px-4 py-3 text-[11px] font-mono text-nexo-faint tabular-nums">{i + 1}</td>
                  <td className="px-4 py-3 max-w-[280px]">
                    <a href={page.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] font-mono text-nexo-sky hover:underline truncate block">{path}</a>
                  </td>
                  <td className="px-4 py-3 text-xs text-nexo-dim">{reasonLabel(page.reason)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
