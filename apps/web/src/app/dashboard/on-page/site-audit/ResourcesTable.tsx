'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import CopyMarkdownButton from '@/components/CopyMarkdownButton';
import ExportCSVButton from '@/components/ExportCSVButton';

interface ResourceItem {
  url?: string;
  resource_type?: string;
  status_code?: number;
  size?: number;
  encoded_size?: number;
  fetch_time?: number;
  checks?: { broken_resources?: boolean; is_redirect?: boolean };
  accept_type?: string;
}

type SortKey = 'url' | 'type' | 'status' | 'size' | 'load';
type SortDir = 'asc' | 'desc';

function formatMs(ms?: number) {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function httpBadge(code?: number) {
  if (!code) return null;
  const cls = code < 300 ? 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30'
    : code < 400 ? 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong'
    : code < 500 ? 'bg-nexo-warn/10 text-nexo-warn-text border-nexo-warn/40'
    : 'bg-nexo-danger/10 text-nexo-danger-text border-nexo-danger/40';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{code}</span>;
}

function sortValue(item: ResourceItem, key: SortKey): number | string {
  switch (key) {
    case 'url': return item.url?.toLowerCase() ?? '';
    case 'type': return item.resource_type ?? '';
    case 'status': return item.status_code ?? -1;
    case 'size': return item.size ?? -1;
    case 'load': return item.fetch_time ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function ResourcesTable({ resources }: { resources: ResourceItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('size');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...resources].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [resources, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function Header({ label, sortK, align, className }: { label: string; sortK: SortKey; align: 'left' | 'center' | 'right'; className?: string }) {
    const active = sortKey === sortK;
    return (
      <th className={`px-4 py-3 text-[10px] font-medium uppercase tracking-widest text-nexo-faint select-none cursor-pointer hover:text-white ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${className ?? ''}`}
        onClick={() => toggleSort(sortK)}>
        <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : align === 'center' ? 'justify-center w-full' : ''}`}>
          {label}
          <SortIcon active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  const csvData = sorted.map((res) => ({
    url: res.url ?? '',
    type: res.resource_type ?? '',
    status: res.status_code ?? '',
    size_kb: res.size != null ? (res.size / 1024).toFixed(1) : '',
    load_ms: res.fetch_time ?? '',
    broken: res.checks?.broken_resources ? 'yes' : 'no',
  }));
  const columns = [
    { key: 'url', label: 'URL' },
    { key: 'type', label: 'Tipo' },
    { key: 'status', label: 'HTTP' },
    { key: 'size_kb', label: 'Tamanho (KB)' },
    { key: 'load_ms', label: 'Carregamento (ms)' },
    { key: 'broken', label: 'Quebrado' },
  ];

  return (
    <div>
      <div className="px-6 py-3 border-b border-nexo-border flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-3 flex-wrap text-[11px] font-medium">
          {['image', 'script', 'stylesheet', 'other'].map((type) => (
            <span key={type} className="text-nexo-dim">
              {resources.filter((r) => (type === 'other' ? !['image', 'script', 'stylesheet'].includes(r.resource_type ?? '') : r.resource_type === type)).length} {({ image: 'imagens', script: 'scripts', stylesheet: 'folhas de estilo', other: 'outros' } as Record<string, string>)[type]}
            </span>
          ))}
          <span className="text-nexo-danger-text">{resources.filter((r) => r.checks?.broken_resources).length} quebrados</span>
        </div>
        <div className="flex items-center gap-2">
          <CopyMarkdownButton data={csvData} columns={columns} />
          <ExportCSVButton data={csvData} filename="site-audit-resources.csv" columns={columns} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-nexo-border bg-white/[0.02]">
              <Header label="URL" sortK="url" align="left" />
              <Header label="Tipo" sortK="type" align="center" />
              <Header label="HTTP" sortK="status" align="center" />
              <Header label="Tamanho" sortK="size" align="right" />
              <Header label="Carregamento" sortK="load" align="right" className="hidden md:table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {sorted.map((res, i) => {
              const sizeKb = res.size != null ? (res.size / 1024).toFixed(1) : null;
              const typeCls: Record<string, string> = { image: 'bg-nexo-blue/10 text-nexo-sky', script: 'bg-nexo-warn/10 text-nexo-warn-text', stylesheet: 'bg-nexo-blue/10 text-nexo-sky' };
              const cls = typeCls[res.resource_type ?? ''] ?? 'bg-nexo-surface-2 text-nexo-dim';
              return (
                <tr key={i} className={`hover:bg-white/[0.04] transition-colors ${res.checks?.broken_resources ? 'bg-nexo-danger/10' : ''}`}>
                  <td className="px-4 py-2.5 max-w-[300px]">
                    <a href={res.url} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-[10px] text-nexo-sky hover:underline truncate block">{res.url ?? '—'}</a>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-[9px] font-medium uppercase px-1.5 py-0.5 rounded ${cls}`}>{res.resource_type ?? '—'}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">{httpBadge(res.status_code)}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-nexo-dim">
                    {sizeKb != null ? (
                      <span className={parseFloat(sizeKb) > 500 ? 'text-nexo-warn-text font-medium' : ''}>{sizeKb} KB</span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-nexo-dim hidden md:table-cell">{formatMs(res.fetch_time)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
