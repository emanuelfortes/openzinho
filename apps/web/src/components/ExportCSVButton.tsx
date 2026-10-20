'use client';

import { Download } from 'lucide-react';
import { csvRows } from '@/lib/csv';

interface Column {
  key: string;
  label: string;
}

export default function ExportCSVButton({
  data,
  filename,
  columns,
}: {
  data: Record<string, unknown>[];
  filename: string;
  columns: Column[];
}) {
  const handleExport = () => {
    const rows = [
      columns.map((c) => c.label),
      ...data.map((row) => columns.map((c) => row[c.key])),
    ];
    const blob = new Blob([csvRows(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="nexo-label flex items-center gap-2 px-4 py-2 rounded-nexo-lg border border-nexo-border hover:bg-white/[0.04] hover:text-white transition-all"
    >
      <Download className="h-3.5 w-3.5" />
      Exportar CSV
    </button>
  );
}
