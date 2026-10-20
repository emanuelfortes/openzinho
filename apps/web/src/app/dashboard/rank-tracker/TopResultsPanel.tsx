'use client';

import type { RankTopResultsCheck } from '@/lib/db';
import { useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { diffTopResults, rankHost } from '@/lib/rank-serp';

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function Change({ position, previous }: { position: number; previous: number | null }) {
  if (previous === null)
    return <span className="text-[9px] font-medium uppercase tracking-wider text-nexo-sky">New</span>;
  const diff = previous - position;
  if (diff === 0) return <span className="text-[11px] text-nexo-faint">—</span>;
  return diff > 0
    ? <span className="text-[10px] font-medium text-nexo-ice">↑{diff}</span>
    : <span className="text-[10px] font-medium text-nexo-danger-text">↓{Math.abs(diff)}</span>;
}

const escapeCell = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** The top 10 of one check as a Markdown table, with the move against the previous check when there is one. */
function topResultsMarkdown(date: string, rows: Array<{ position: number; domain: string; url: string; title: string | null; previousPosition: number | null }>, hasPrevious: boolean) {
  const change = (position: number, previous: number | null) => {
    if (previous === null) return 'new';
    const diff = previous - position;
    return diff === 0 ? '=' : diff > 0 ? `+${diff}` : `${diff}`;
  };
  const header = hasPrevious ? ['#', 'Domain', 'Title', 'URL', 'Change'] : ['#', 'Domain', 'Title', 'URL'];
  return [
    `Top 10 on ${date}`,
    '',
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => {
      const cells = [String(row.position), escapeCell(row.domain), escapeCell(row.title ?? ''), escapeCell(row.url)];
      if (hasPrevious) cells.push(change(row.position, row.previousPosition));
      return `| ${cells.join(' | ')} |`;
    }),
  ].join('\n');
}

function CopyTopButton({ getMarkdown }: { getMarkdown: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(getMarkdown());
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 text-[10px] font-medium text-nexo-dim border border-nexo-border rounded-nexo px-2 py-1 mb-2 hover:bg-white/[0.04] hover:text-white transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-nexo-ice" /> : <ClipboardCopy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy as Markdown'}
    </button>
  );
}

interface Props {
  /** Saved top 10s, newest first; null while loading. Loaded by the row so the chart can share them. */
  checks: RankTopResultsCheck[] | null;
  failed: boolean;
  trackedDomain: string;
  /** Date shown, as picked on the chart or in the menu below. */
  selectedDate: string | null;
  onSelect: (date: string) => void;
}

export default function TopResultsPanel({ checks, failed, trackedDomain, selectedDate, onSelect }: Props) {
  const title = (
    <div className="nexo-label mb-2">Top 10 results</div>
  );

  if (failed) return <div className="mt-5">{title}<p className="text-xs text-nexo-faint">Could not load the top 10.</p></div>;
  if (checks === null) return <div className="mt-5">{title}<p className="text-xs text-nexo-faint">Loading…</p></div>;
  if (checks.length === 0) {
    return (
      <div className="mt-5">
        {title}
        <p className="text-xs text-nexo-faint">The top 10 is saved with each check. Run a check to see who ranks around you.</p>
      </div>
    );
  }

  // `checks` is newest first; the check right after the selected one in the list is the one before it in time.
  const index = Math.max(0, checks.findIndex((check) => check.date === selectedDate));
  const current = checks[index];
  const previous = checks[index + 1] ?? null;
  const diff = diffTopResults(current.topResults, previous?.topResults ?? null);
  const mine = rankHost(trackedDomain);

  return (
    <div className="mt-5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 mb-2">
        {title}
        <div className="flex shrink-0 items-center gap-2">
        <CopyTopButton getMarkdown={() => topResultsMarkdown(current.date, diff.rows, previous !== null)} />
        {checks.length === 1 && <span className="text-[10px] font-medium text-nexo-dim mb-2">{formatDay(current.date)}</span>}
        {checks.length > 1 && (
          <select
            value={current.date}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Check date"
            className="nexo-input min-w-0 w-full text-[10px] font-medium px-2 py-1 mb-2"
          >
            {checks.map((check) => <option key={check.date} value={check.date}>{formatDay(check.date)}</option>)}
          </select>
        )}
        </div>
      </div>

      <ol className="rounded-nexo-lg border border-nexo-border bg-nexo-surface divide-y divide-nexo-border overflow-hidden">
        {diff.rows.map((row) => {
          const isMine = row.domain === mine || row.domain.endsWith(`.${mine}`);
          return (
            <li
              key={`${row.position}-${row.url}`}
              className={`flex items-center gap-3 px-3 py-1.5 ${isMine ? 'bg-nexo-blue/10' : ''}`}
            >
              <span className="w-6 text-[11px] font-medium tabular-nums text-nexo-faint">#{row.position}</span>
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                title={row.title ? `${row.title}\n${row.url}` : row.url}
                className={`min-w-0 flex-1 truncate text-[11px] hover:underline ${isMine ? 'font-medium text-nexo-sky' : 'font-semibold text-nexo-dim'}`}
              >
                {row.domain}
                <span className="ml-2 font-mono font-normal text-nexo-faint">{row.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
              </a>
              <span className="w-10 text-right shrink-0">
                {previous && <Change position={row.position} previous={row.previousPosition} />}
              </span>
            </li>
          );
        })}
      </ol>

      {previous ? (
        <div className="mt-2 text-[10px] text-nexo-faint">
          <span className="font-semibold">vs {formatDay(previous.date)}.</span>
          {diff.dropped.length > 0 ? (
            <> Left the top 10: {diff.dropped.map((d, i) => (
              <span key={d.domain}>{i > 0 && ', '}<span className="font-medium text-nexo-dim">{d.domain}</span> (was #{d.position})</span>
            ))}</>
          ) : ' No domain left the top 10.'}
        </div>
      ) : (
        <div className="mt-2 text-[10px] text-nexo-faint">Changes appear from the next check.</div>
      )}
    </div>
  );
}
