'use client';

import { Check, ClipboardCopy } from 'lucide-react';
import { useState } from 'react';

interface Column {
  key: string;
  label: string;
}

export default function CopyMarkdownButton({
  data,
  columns,
}: {
  data: Record<string, unknown>[];
  columns: Column[];
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const escape = (val: unknown) => String(val ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const rows = [
      `| ${columns.map((c) => escape(c.label)).join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...data.map((row) => `| ${columns.map((c) => escape(row[c.key])).join(' | ')} |`),
    ];
    await navigator.clipboard.writeText(rows.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className="nexo-label flex items-center gap-2 px-4 py-2 rounded-nexo-lg border border-nexo-border hover:bg-white/[0.04] hover:text-white transition-all"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-nexo-ice" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy as Markdown'}
    </button>
  );
}
