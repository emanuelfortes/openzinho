'use client';

import { useState } from 'react';
import { Download, LoaderCircle } from 'lucide-react';
import type { CampaignReport } from './analysis';
import { buildReportPdf, filenamePart, type ReportBrand } from './report-pdf';

export default function ReportPdfButton({ report, brand }: { report: CampaignReport; brand: ReportBrand }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportPdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const pdf = await buildReportPdf(report, brand);
      pdf.save(`relatorio-${filenamePart(report.campaignName)}-${report.month}.pdf`);
    } catch {
      setError('Não foi possível gerar o PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={exportPdf} disabled={busy} className="nexo-btn-primary inline-flex items-center gap-2 px-3 py-2.5 disabled:cursor-wait disabled:opacity-70">
        {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {busy ? 'Preparando PDF…' : 'Exportar PDF'}
      </button>
      {error && <span className="text-[11px] text-nexo-danger-text">{error}</span>}
    </span>
  );
}
