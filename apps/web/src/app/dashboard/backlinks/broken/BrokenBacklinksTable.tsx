'use client';

import { Fragment, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import { groupByBrokenPage, type BrokenLink, type BrokenPage } from './group';

type View = 'pages' | 'links';
type PageSort = 'domains' | 'links' | 'dofollow' | 'dr';
type LinkSort = 'dr' | 'source' | 'target' | 'seen';
type SortDir = 'asc' | 'desc';

function DRBadge({ value }: { value?: number }) {
  if (value === undefined || value === null) return <span className="text-nexo-faint text-xs">—</span>;
  const color = value >= 70 ? 'bg-nexo-ice text-nexo-bg' : value >= 40 ? 'bg-nexo-blue text-white' : 'bg-nexo-surface-2 text-nexo-dim';
  return <span className={`inline-flex items-center justify-center w-8 h-5 rounded text-[10px] font-medium ${color}`}>{value}</span>;
}

function StatusBadge({ code }: { code?: number | null }) {
  if (!code) return <span className="text-[10px] font-mono text-nexo-faint bg-nexo-surface-2 px-1.5 py-0.5 rounded" title="Not crawled yet">n/a</span>;
  const color = code >= 500
    ? 'text-nexo-warn-text bg-nexo-warn/10'
    : 'text-nexo-danger-text bg-nexo-danger/10';
  return <span className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${color}`}>{code}</span>;
}

function DoBadge({ dofollow }: { dofollow?: boolean }) {
  return (
    <span className={`shrink-0 text-[9px] font-medium uppercase px-1.5 py-0.5 rounded ${dofollow ? 'text-nexo-ice bg-nexo-ice/10' : 'text-nexo-faint bg-nexo-surface-2'}`}>
      {dofollow ? 'do' : 'no'}
    </span>
  );
}

function formatSeen(s?: string) {
  if (!s) return '—';
  const d = new Date(s.replace(' +00:00', 'Z').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return s.split(' ')[0];
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

function useSort<K extends string>(initial: K) {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<SortDir>('desc');
  const toggle = (k: K) => {
    if (k === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setKey(k); setDir('desc'); }
  };
  return { key, dir, toggle };
}

function cmp(a: number | string, b: number | string) {
  return typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b;
}

const TH = 'nexo-label px-4 py-3 whitespace-nowrap';

function SortHeader<K extends string>({ label, k, sort, align = 'left', className = '' }: {
  label: string; k: K; sort: { key: K; dir: SortDir; toggle: (k: K) => void }; align?: 'left' | 'right' | 'center'; className?: string;
}) {
  const active = sort.key === k;
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={`${TH} ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      <button type="button" onClick={() => sort.toggle(k)}
        className={`inline-flex items-center gap-1 uppercase tracking-widest hover:text-white ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <SortIcon active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

function LinkSource({ link }: { link: BrokenLink }) {
  return (
    <>
      <a href={link.url_from} target="_blank" rel="noopener noreferrer"
        className="text-xs font-mono text-nexo-dim hover:text-nexo-sky transition-colors truncate block">
        {link.url_from}
      </a>
      <span className="text-[10px] text-nexo-faint">{link.domain_from}</span>
    </>
  );
}

function Anchor({ link }: { link: BrokenLink }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {link.anchor ? (
        <span className="text-xs text-nexo-text font-medium truncate">{link.anchor}</span>
      ) : link.image_url ? (
        <span className="text-[10px] text-nexo-faint italic">Image</span>
      ) : (
        <span className="text-nexo-faint text-xs">—</span>
      )}
      <DoBadge dofollow={link.dofollow} />
    </div>
  );
}

function PagesView({ pages }: { pages: BrokenPage[] }) {
  const sort = useSort<PageSort>('domains');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    const val = (p: BrokenPage): number => {
      switch (sort.key) {
        case 'domains': return p.domains;
        case 'links': return p.links.length;
        case 'dofollow': return p.dofollow;
        case 'dr': return p.bestDr ?? -1;
      }
    };
    return [...pages].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * cmp(val(a), val(b)));
  }, [pages, sort.key, sort.dir]);

  const toggle = (url: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(url)) next.delete(url); else next.add(url);
    return next;
  });

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-nexo-border bg-white/[0.02]">
          <th className={`${TH} text-left`}>Broken page</th>
          <th className={`${TH} text-center w-16`}>Status</th>
          <SortHeader label="Domains" k="domains" sort={sort} align="right" className="w-24" />
          <SortHeader label="Links" k="links" sort={sort} align="right" className="w-20" />
          <SortHeader label="Dofollow" k="dofollow" sort={sort} align="right" className="w-24 hidden sm:table-cell" />
          <SortHeader label="Best DR" k="dr" sort={sort} align="center" className="w-24" />
        </tr>
      </thead>
      <tbody className="divide-y divide-nexo-border">
        {sorted.map((p) => {
          const isOpen = open.has(p.url);
          return (
            <Fragment key={p.url}>
              <tr className="hover:bg-white/[0.04] transition-colors">
                <td className="px-4 py-3 max-w-0 w-full">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <button type="button" onClick={() => toggle(p.url)} aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Hide' : 'Show'} the ${p.links.length} links to ${p.url}`}
                      className="shrink-0 p-0.5 rounded text-nexo-faint hover:text-white hover:bg-white/[0.04]">
                      <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                    </button>
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono font-semibold text-nexo-text hover:text-nexo-sky truncate">
                      {p.url || '—'}
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3 text-center whitespace-nowrap">
                  {p.statuses.length ? p.statuses.map((s) => <StatusBadge key={s} code={s} />) : <StatusBadge />}
                </td>
                <td className="px-4 py-3 text-right font-mono font-medium text-nexo-dim tabular-nums">{p.domains.toLocaleString('en-GB')}</td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums">{p.links.length.toLocaleString('en-GB')}</td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden sm:table-cell">{p.dofollow.toLocaleString('en-GB')}</td>
                <td className="px-4 py-3 text-center"><DRBadge value={p.bestDr} /></td>
              </tr>
              {isOpen && (
                <tr className="bg-white/[0.02]">
                  <td colSpan={6} className="px-4 pb-3 pt-1">
                    <ul className="ml-6 border-l border-nexo-border divide-y divide-nexo-border">
                      {p.links.map((l, i) => (
                        <li key={`${l.url_from}-${i}`} className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,14rem)] items-center gap-3 pl-3 py-2">
                          <DRBadge value={l.domain_from_rank} />
                          <div className="min-w-0"><LinkSource link={l} /></div>
                          <Anchor link={l} />
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function LinksView({ links }: { links: BrokenLink[] }) {
  const sort = useSort<LinkSort>('dr');
  const sorted = useMemo(() => {
    const val = (l: BrokenLink): number | string => {
      switch (sort.key) {
        case 'dr': return l.domain_from_rank ?? -1;
        case 'source': return l.domain_from?.toLowerCase() ?? '';
        case 'target': return l.url_to?.toLowerCase() ?? '';
        case 'seen': return l.first_seen ?? '';
      }
    };
    return [...links].sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * cmp(val(a), val(b)));
  }, [links, sort.key, sort.dir]);

  return (
    <table className="w-full text-sm table-fixed">
      <thead>
        <tr className="border-b border-nexo-border bg-white/[0.02]">
          <SortHeader label="DR" k="dr" sort={sort} align="center" className="w-16" />
          <SortHeader label="Source page" k="source" sort={sort} />
          <th className={`${TH} text-left w-48 hidden md:table-cell`}>Anchor</th>
          <SortHeader label="Broken page" k="target" sort={sort} />
          <SortHeader label="First seen" k="seen" sort={sort} align="right" className="w-32 hidden lg:table-cell" />
        </tr>
      </thead>
      <tbody className="divide-y divide-nexo-border">
        {sorted.map((l, i) => (
          <tr key={`${l.url_from}-${l.url_to}-${i}`} className="hover:bg-white/[0.04] transition-colors">
            <td className="px-4 py-3 text-center"><DRBadge value={l.domain_from_rank} /></td>
            <td className="px-4 py-3 min-w-0"><LinkSource link={l} /></td>
            <td className="px-4 py-3 hidden md:table-cell"><Anchor link={l} /></td>
            <td className="px-4 py-3 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <StatusBadge code={l.url_to_status_code} />
                <a href={l.url_to} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-mono text-nexo-dim hover:text-nexo-sky truncate">
                  {l.url_to}
                </a>
              </div>
            </td>
            <td className="px-4 py-3 text-right hidden lg:table-cell">
              <span className="text-[11px] text-nexo-faint tabular-nums">{formatSeen(l.first_seen)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function BrokenBacklinksTable({ links }: { links: BrokenLink[] }) {
  const [view, setView] = useState<View>('pages');
  const pages = useMemo(() => groupByBrokenPage(links), [links]);

  const tab = (v: View, label: string, count: number) => (
    <button type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
      className="transition-colors hover:text-white">
      {label} <span className="font-mono opacity-60 ml-0.5">{count.toLocaleString('en-GB')}</span>
    </button>
  );

  return (
    <div>
      <div className="px-6 py-3 border-b border-nexo-border flex items-center gap-3 flex-wrap">
        <div role="tablist" aria-label="Group results" className="nexo-seg">
          {tab('pages', 'By broken page', pages.length)}
          {tab('links', 'All links', links.length)}
        </div>
        <p className="text-[11px] text-nexo-faint">
          {view === 'pages' ? 'Fix the pages with the most referring domains first.' : 'Every live link landing on a 4xx/5xx page.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        {view === 'pages' ? <PagesView pages={pages} /> : <LinksView links={links} />}
      </div>
    </div>
  );
}
