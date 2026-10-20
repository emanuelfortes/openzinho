'use client';

// Deletes a Geo-grid monitor (every snapshot plus its schedule).
import { deleteGridMonitor } from '../geo-grid/actions';

export default function DeleteMonitorButton({ runId, compact = false }: { runId: string; compact?: boolean }) {
  return (
    <form
      action={deleteGridMonitor}
      onSubmit={(event) => {
        if (!window.confirm('Delete this monitor? Its schedule and every snapshot will be removed. This cannot be undone.')) event.preventDefault();
      }}
    >
      <input type="hidden" name="run_id" value={runId} />
      <button
        type="submit"
        title="Delete this monitor"
        className={compact
          ? 'nexo-label transition-colors hover:text-nexo-danger-text'
          : 'inline-flex items-center rounded-nexo-lg border border-nexo-danger/40 bg-nexo-surface px-3 py-2 text-[10px] font-medium uppercase tracking-widest text-nexo-danger-text transition-colors hover:bg-nexo-danger/15'}
      >
        Delete
      </button>
    </form>
  );
}
