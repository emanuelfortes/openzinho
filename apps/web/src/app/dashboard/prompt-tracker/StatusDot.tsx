import { STATUS_LABEL, type CheckStatus } from '@/lib/prompt-report';

const DOT: Record<CheckStatus | 'none', string> = {
  cited: 'bg-nexo-ice border-nexo-ice/30',
  'not-cited': 'bg-nexo-surface border-nexo-border',
  error: 'bg-nexo-danger border-nexo-danger/40',
  none: 'bg-nexo-surface-2 border-nexo-border',
};

/** One check result: green = cited, white = not cited, red = error, grey = no check that day. */
export default function StatusDot({ status, title, size = 'md' }: { status: CheckStatus | null; title?: string; size?: 'sm' | 'md' }) {
  const key = status ?? 'none';
  const dimension = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return (
    <span
      title={title ?? (status ? STATUS_LABEL[status] : 'Sem verificação')}
      className={`inline-block shrink-0 rounded-full border ${dimension} ${DOT[key]}`}
      aria-label={title ?? (status ? STATUS_LABEL[status] : 'Sem verificação')}
    />
  );
}
