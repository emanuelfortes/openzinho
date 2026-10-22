// Public, read-only campaign report behind a secret link. No session, no project switching and
// no server actions: the token alone selects one campaign of one project.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { runInProjectScope } from '@/lib/db';
import { getBrandSettings } from '@/lib/brand-server';
import { getCampaign } from '@/modules/grade/campaigns-db';
import CampaignReportView from '@/modules/relatorio/CampaignReportView';
import ReportPdfButton from '@/modules/relatorio/ReportPdfButton';
import { reportBrand } from '@/modules/relatorio/report-brand';
import { recentMonths, resolveReportMonth } from '@/modules/relatorio/months';
import { buildCampaignReport } from '@/modules/relatorio/report-db';
import { resolveShareToken } from '@/modules/relatorio/share-tokens';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Relatório mensal',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  // Keeps the token out of the Referer header of any outgoing request.
  referrer: 'no-referrer',
};

export default async function PublicReportPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { token } = await params;
  const { mes } = await searchParams;
  const resolved = resolveShareToken(token);
  if (!resolved) notFound();

  const data = runInProjectScope(resolved.projectId, () => {
    const campaign = getCampaign(resolved.campaignId);
    if (!campaign) return null;
    const now = new Date();
    const month = resolveReportMonth(typeof mes === 'string' ? mes : undefined, now, campaign.time_zone);
    return {
      report: buildCampaignReport(campaign, month, now.getTime()),
      months: recentMonths(now, campaign.time_zone),
      timeZone: campaign.time_zone,
      brand: getBrandSettings(),
    };
  });
  if (!data) notFound();
  const { report, brand } = data;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-nexo-border pb-5">
        <div className="min-w-0">
          {brand.logo
            // eslint-disable-next-line @next/next/no-img-element -- data URL from the white-label settings
            ? <img src={brand.logo} alt={brand.name} className="mb-3 h-8 w-auto max-w-[160px] object-contain" />
            : <p className="nexo-section mb-2">{brand.name}</p>}
          <h1 className="nexo-h1">Relatório mensal</h1>
          <p className="mt-1 text-sm text-nexo-dim">{report.campaignName} · {report.target}</p>
        </div>
        <p className="nexo-label">Somente leitura</p>
      </header>

      <CampaignReportView
        report={report}
        timeZone={data.timeZone}
        monthOptions={data.months}
        actions={<ReportPdfButton report={report} brand={reportBrand(brand)} />}
      />

      <footer className="border-t border-nexo-border pt-4 text-[11px] text-nexo-faint">
        {brand.footer || `Preparado por ${brand.name}`}
      </footer>
    </main>
  );
}
