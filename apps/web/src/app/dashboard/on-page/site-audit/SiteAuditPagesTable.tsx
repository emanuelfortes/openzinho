'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface AuditPage {
  url?: string;
  resource_type?: string;
  status_code?: number;
  onpage_score?: number;
  size?: number;
  meta?: {
    title?: string;
    description?: string;
    title_length?: number;
    description_length?: number;
    internal_links_count?: number;
    external_links_count?: number;
    images_count?: number;
    content?: { plain_text_word_count?: number };
  };
  page_timing?: { duration_time?: number; waiting_time?: number };
  checks?: Record<string, boolean | undefined>;
}

type Sev = 'error' | 'warning' | 'info' | 'good';

const PAGE_CHECKS: Record<string, { label: string; sev: Sev }> = {
  no_title: { label: 'Título ausente', sev: 'error' },
  no_description: { label: 'Descrição ausente', sev: 'error' },
  no_h1_tag: { label: 'H1 ausente', sev: 'error' },
  is_4xx_code: { label: 'Erro 4XX', sev: 'error' },
  is_5xx_code: { label: 'Erro 5XX', sev: 'error' },
  is_broken: { label: 'Quebrada', sev: 'error' },
  duplicate_title_tag: { label: 'Título duplicado', sev: 'error' },
  has_micromarkup_errors: { label: 'Erros de microdados', sev: 'error' },
  high_loading_time: { label: 'Carregamento lento', sev: 'warning' },
  high_waiting_time: { label: 'TTFB alto', sev: 'warning' },
  https_to_http_links: { label: 'Links HTTPS→HTTP', sev: 'warning' },
  no_image_alt: { label: 'Sem texto alt', sev: 'warning' },
  no_favicon: { label: 'Sem favicon', sev: 'warning' },
  title_too_long: { label: 'Título longo demais', sev: 'warning' },
  title_too_short: { label: 'Título curto demais', sev: 'warning' },
  low_content_rate: { label: 'Pouco texto', sev: 'warning' },
  has_render_blocking_resources: { label: 'Bloqueio de renderização', sev: 'warning' },
  large_page_size: { label: 'Página pesada', sev: 'warning' },
  low_character_count: { label: 'Poucos caracteres', sev: 'warning' },
  deprecated_html_tags: { label: 'HTML obsoleto', sev: 'warning' },
  duplicate_meta_tags: { label: 'Meta duplicada', sev: 'warning' },
  no_encoding_meta_tag: { label: 'Charset ausente', sev: 'warning' },
  irrelevant_description: { label: 'Descr. irrelevante', sev: 'warning' },
  irrelevant_title: { label: 'Título irrelevante', sev: 'warning' },
  is_https: { label: 'HTTPS', sev: 'good' },
  has_html_doctype: { label: 'DOCTYPE', sev: 'good' },
  has_micromarkup: { label: 'Dados estruturados', sev: 'good' },
  seo_friendly_url: { label: 'URL amigável', sev: 'good' },
  canonical: { label: 'Canonical definida', sev: 'info' },
  is_redirect: { label: 'Tem redirecionamento', sev: 'info' },
};

function fmt(n?: number) { return n !== undefined && n !== null ? n.toLocaleString('pt-BR') : '—'; }

function formatMs(ms?: number) {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function scoreBg(score?: number) {
  if (!score) return 'bg-nexo-surface-2 border-nexo-border text-nexo-dim';
  if (score >= 80) return 'bg-nexo-ice/10 border-nexo-ice/30 text-nexo-ice';
  if (score >= 50) return 'bg-nexo-warn/10 border-nexo-warn/40 text-nexo-warn-text';
  return 'bg-nexo-danger/10 border-nexo-danger/40 text-nexo-danger-text';
}

function httpBadge(code?: number) {
  if (!code) return null;
  const cls = code < 300 ? 'bg-nexo-ice/10 text-nexo-ice border-nexo-ice/30'
    : code < 400 ? 'bg-nexo-blue/10 text-nexo-sky border-nexo-border-strong'
    : code < 500 ? 'bg-nexo-warn/10 text-nexo-warn-text border-nexo-warn/40'
    : 'bg-nexo-danger/10 text-nexo-danger-text border-nexo-danger/40';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>{code}</span>;
}

function countPageIssues(page: AuditPage) {
  if (!page.checks) return { errors: 0, warnings: 0 };
  let errors = 0, warnings = 0;
  for (const [k, v] of Object.entries(page.checks)) {
    if (!v) continue;
    const sev = PAGE_CHECKS[k]?.sev;
    if (sev === 'error') errors++;
    else if (sev === 'warning') warnings++;
  }
  return { errors, warnings };
}

type SortKey = 'url' | 'score' | 'status' | 'issues' | 'load' | 'words';
type SortDir = 'asc' | 'desc';

function sortValue(page: AuditPage, key: SortKey): number | string {
  switch (key) {
    case 'url': return page.url?.toLowerCase() ?? '';
    case 'score': return page.onpage_score ?? -1;
    case 'status': return page.status_code ?? -1;
    case 'issues': {
      const { errors, warnings } = countPageIssues(page);
      return errors * 1000 + warnings;
    }
    case 'load': return page.page_timing?.duration_time ?? -1;
    case 'words': return page.meta?.content?.plain_text_word_count ?? -1;
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 text-nexo-faint" />;
  return dir === 'asc' ? <ArrowUp className="w-3 h-3 text-nexo-sky" /> : <ArrowDown className="w-3 h-3 text-nexo-sky" />;
}

export default function SiteAuditPagesTable({ pages }: { pages: AuditPage[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('issues');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...pages].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp = typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va - vb;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [pages, sortKey, sortDir]);

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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-nexo-border bg-white/[0.02]">
            <th className="nexo-label px-4 py-3 text-left">#</th>
            <Header label="URL" sortK="url" align="left" />
            <Header label="Nota" sortK="score" align="center" />
            <Header label="HTTP" sortK="status" align="center" />
            <th className="nexo-label px-4 py-3 text-left hidden md:table-cell">Título</th>
            <Header label="Problemas" sortK="issues" align="center" />
            <Header label="Carregamento" sortK="load" align="right" className="hidden lg:table-cell" />
            <Header label="Palavras" sortK="words" align="right" className="hidden xl:table-cell" />
          </tr>
        </thead>
        <tbody className="divide-y divide-nexo-border">
          {sorted.map((page, i) => {
            const { errors: errCount, warnings: warnCount } = countPageIssues(page);
            const path = page.url ? (() => { try { return new URL(page.url).pathname; } catch { return page.url; } })() : '—';
            return (
              <tr key={i} className="hover:bg-white/[0.04] transition-colors">
                <td className="px-4 py-3 text-[11px] font-mono text-nexo-faint tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 max-w-[280px]">
                  <a href={page.url} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-mono text-nexo-sky hover:text-white truncate block hover:underline">
                    {path}
                  </a>
                </td>
                <td className="px-4 py-3 text-center">
                  {page.onpage_score !== undefined ? (
                    <span className={`inline-flex items-center justify-center w-12 h-6 rounded text-[11px] font-medium border ${scoreBg(page.onpage_score)}`}>
                      {page.onpage_score.toFixed(0)}
                    </span>
                  ) : <span className="text-nexo-faint">—</span>}
                </td>
                <td className="px-4 py-3 text-center">{httpBadge(page.status_code)}</td>
                <td className="px-4 py-3 max-w-[200px] hidden md:table-cell">
                  <span className="text-xs text-nexo-dim truncate block">{page.meta?.title ?? <span className="text-nexo-faint italic">sem título</span>}</span>
                  {page.meta?.title_length !== undefined && (
                    <span className={`text-[10px] ${page.meta.title_length > 65 || page.meta.title_length < 30 ? 'text-nexo-warn-text' : 'text-nexo-faint'}`}>{page.meta.title_length} caracteres</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {errCount > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-nexo-danger/10 text-nexo-danger-text border border-nexo-danger/40">{errCount}</span>}
                    {warnCount > 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-nexo-warn/10 text-nexo-warn-text border border-nexo-warn/40">{warnCount}</span>}
                    {errCount === 0 && warnCount === 0 && <span className="text-nexo-ice text-xs">✓</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden lg:table-cell text-xs">
                  {formatMs(page.page_timing?.duration_time)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-nexo-dim tabular-nums hidden xl:table-cell text-xs">
                  {fmt(page.meta?.content?.plain_text_word_count)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
