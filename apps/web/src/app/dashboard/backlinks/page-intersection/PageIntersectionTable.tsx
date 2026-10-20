'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export interface PageIntItem {
  url_from?: string;
  domain_from?: string;
  page_from_rank?: number;
  backlinks_spam_score?: number;
  url_to?: string[];
}

type SortKey = 'url_from' | 'page_from_rank' | 'spam' | 'targets_linked';
type SortDir = 'asc' | 'desc';

function RankBadge({ rank }: { rank?: number }) {
  if (rank == null) return <span className="text-nexo-faint text-xs">—</span>;
  const cls = rank >= 70 ? 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30' : rank >= 40 ? 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong' : 'bg-nexo-surface-2 text-nexo-dim border-nexo-border';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>DR {rank}</span>;
}

function SpamBadge({ score }: { score?: number }) {
  if (score == null) return <span className="text-nexo-faint">—</span>;
  const cls = score >= 60 ? 'bg-nexo-danger/10 text-nexo-danger-text border-nexo-danger/40' : score >= 30 ? 'bg-nexo-warn/10 text-nexo-warn-text border-nexo-warn/40' : 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border tabular-nums ${cls}`}>{score}</span>;
}

function sortValue(item: PageIntItem, key: SortKey): number | string {
  switch (key) {
    case 'url_from': return item.url_from?.toLowerCase() ?? '';
    case 'page_from_rank': return item.page_from_rank ?? -1;
    case 'spam': return item.backlinks_spam_score ?? -1;
    case 'targets_linked': return item.url_to?.length ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function PageIntersectionTable({ items }: { items: PageIntItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('page_from_rank');
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

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
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
            <Header label="From URL" sortK="url_from" align="left" className="!px-6" />
            <Header label="DR" sortK="page_from_rank" align="center" />
            <Header label="Spam" sortK="spam" align="center" className="hidden sm:table-cell" />
            <Header label="Targets linked" sortK="targets_linked" align="right" className="hidden md:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => (
            <tr key={i} className="hover:bg-white/[0.04] transition-colors">
              <td className="px-6 py-3 max-w-[320px]">
                <a href={item.url_from} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] font-mono text-nexo-sky hover:underline truncate block">{item.url_from ?? '—'}</a>
                <span className="text-[10px] text-nexo-faint">{item.domain_from}</span>
              </td>
              <td className="px-4 py-3 text-center"><RankBadge rank={item.page_from_rank} /></td>
              <td className="px-4 py-3 text-center hidden sm:table-cell"><SpamBadge score={item.backlinks_spam_score} /></td>
              <td className="px-4 py-3 text-right text-nexo-dim tabular-nums hidden md:table-cell text-xs font-mono">{item.url_to?.length ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
