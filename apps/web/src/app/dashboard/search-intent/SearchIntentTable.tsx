'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface IntentItem {
  keyword?: string;
  keyword_intent?: { label?: string; probability?: number } | null;
  secondary_keyword_intents?: Array<{ label?: string; probability?: number }> | null;
}

type SortKey = 'keyword' | 'intent';
type SortDir = 'asc' | 'desc';

const INTENT_CONFIG: Record<string, { label: string; cls: string }> = {
  informational: { label: 'Informacional', cls: 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong' },
  navigational:  { label: 'Navegacional',  cls: 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong' },
  commercial:    { label: 'Comercial',     cls: 'bg-nexo-warn/10 text-nexo-warn-text border-nexo-warn/40' },
  transactional: { label: 'Transacional',  cls: 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30' },
};

function IntentBadge({ intent }: { intent?: string }) {
  if (!intent) return <span className="text-nexo-faint text-xs">—</span>;
  const cfg = INTENT_CONFIG[intent];
  if (!cfg) return <span className="text-xs text-nexo-dim">{intent}</span>;
  return <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded border ${cfg.cls}`}>{cfg.label}</span>;
}

function getMainIntent(item: IntentItem) { return item.keyword_intent?.label; }
function getSecondaryIntents(item: IntentItem) {
  return item.secondary_keyword_intents?.map((s) => s.label).filter(Boolean) as string[] | undefined;
}

function sortValue(item: IntentItem, key: SortKey): string {
  switch (key) {
    case 'keyword': return item.keyword?.toLowerCase() ?? '';
    case 'intent': return getMainIntent(item)?.toLowerCase() ?? '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function SearchIntentTable({ items }: { items: IntentItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    if (!sortKey) return items;
    return [...items].sort((a, b) => {
      const cmp = sortValue(a, sortKey).localeCompare(sortValue(b, sortKey));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : 'text-center'} ${className ?? ''}`}
          onClick={() => toggleSort(sortK)}>
        <span className="inline-flex items-center justify-center gap-1">
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
            <Header label="Palavra-chave" sortK="keyword" align="left" />
            <Header label="Intenção principal" sortK="intent" align="center" />
            <th className="nexo-label px-4 py-3 text-left hidden md:table-cell">Intenções secundárias</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((item, i) => {
            const secondary = getSecondaryIntents(item);
            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-6 py-3 text-[11px] font-mono text-nexo-faint tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-nexo-text">{item.keyword ?? '—'}</td>
                <td className="px-4 py-3 text-center"><IntentBadge intent={getMainIntent(item)} /></td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex gap-1 flex-wrap">
                    {secondary?.map((s) => <IntentBadge key={s} intent={s} />)}
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
