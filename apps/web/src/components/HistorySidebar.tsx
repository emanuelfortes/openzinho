'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HistorySidebarProps {
  title: string;
  items: React.ReactNode[];
  /** How many entries to show per page before paginating. */
  perPage?: number;
}

export default function HistorySidebar({ title, items, perPage = 8 }: HistorySidebarProps) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * perPage;
  const visible = items.slice(start, start + perPage);

  return (
    <aside className="w-full lg:w-80 shrink-0 lg:sticky lg:top-0 lg:self-start">
      <div className="bg-nexo-surface rounded-nexo-lg border border-nexo-border overflow-hidden">
        <div className="px-5 py-4 border-b border-nexo-border flex items-center justify-between">
          <h2 className="nexo-label">{title}</h2>
          <span className="text-[11px] tabular-nums text-nexo-faint">{items.length}</span>
        </div>

        <div className="divide-y divide-nexo-border">
          {visible}
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-nexo-border">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="nexo-label inline-flex items-center gap-1 hover:text-white disabled:opacity-30 disabled:hover:text-nexo-dim transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Anterior
            </button>
            <span className="text-[11px] tabular-nums text-nexo-faint">
              {safePage + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="nexo-label inline-flex items-center gap-1 hover:text-white disabled:opacity-30 disabled:hover:text-nexo-dim transition-colors"
            >
              Próxima <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
