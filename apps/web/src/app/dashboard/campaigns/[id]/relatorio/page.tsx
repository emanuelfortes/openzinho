import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileBarChart } from 'lucide-react';
import { getBrandSettings } from '@/lib/brand-server';
import { getCampaign } from '@/modules/grade/campaigns-db';
import CampaignReportView from '@/modules/relatorio/CampaignReportView';
import ReportPdfButton from '@/modules/relatorio/ReportPdfButton';
import { reportBrand } from '@/modules/relatorio/report-brand';
import ShareLinkPanel from '@/modules/relatorio/ShareLinkPanel';
import { recentMonths, resolveReportMonth } from '@/modules/relatorio/months';
import { buildCampaignReport } from '@/modules/relatorio/report-db';
import { listShareTokens } from '@/modules/relatorio/share-tokens';
import { createShareLinkAction, revokeShareLinksAction } from './actions';

async function CampaignReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { id } = await params;
  const { mes } = await searchParams;
  const campaign = getCampaign(id);
  if (!campaign) notFound();
  const now = new Date();
  const month = resolveReportMonth(mes, now, campaign.time_zone);
  const report = buildCampaignReport(campaign, month, now.getTime());
  const brand = getBrandSettings();

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-1 grid h-9 w-9 place-items-center rounded-nexo-lg bg-nexo-blue/10 text-nexo-sky">
          <FileBarChart className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <Link href={`/dashboard/campaigns#campaign-${campaign.id}`} className="nexo-label hover:text-white">← Campanhas</Link>
          <h1 className="nexo-h1 mt-1">Relatório mensal</h1>
          <p className="mt-1 text-sm text-nexo-dim">{campaign.name} · {campaign.target}</p>
        </div>
      </div>

      <CampaignReportView
        report={report}
        timeZone={campaign.time_zone}
        monthOptions={recentMonths(now, campaign.time_zone)}
        actions={<ReportPdfButton report={report} brand={reportBrand(brand)} />}
      />

      <ShareLinkPanel campaignId={campaign.id} links={listShareTokens(campaign.id)} createAction={createShareLinkAction} revokeAction={revokeShareLinksAction} />
    </div>
  );
}

export default withProjectScope(CampaignReportPage);
