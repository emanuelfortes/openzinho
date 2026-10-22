// Work behind the share-link server actions; called inside the action's project scope.
import { revalidatePath } from 'next/cache';
import { getCampaign } from '@/modules/grade/campaigns-db';
import { createShareToken, publicBaseUrl, revokeShareTokens, sharePath } from './share-tokens';

export type ShareLinkState =
  | { status: 'idle' }
  | { status: 'created'; path: string; base: string | null }
  | { status: 'error'; message: string };

export function reportPath(campaignId: string): string {
  return `/dashboard/campaigns/${encodeURIComponent(campaignId)}/relatorio`;
}

export function createShareLink(campaignId: string): ShareLinkState {
  const campaign = getCampaign(campaignId);
  if (!campaign) return { status: 'error', message: 'Campanha não encontrada.' };
  const token = createShareToken(campaign.id, 'manual');
  revalidatePath(reportPath(campaign.id));
  // The token is returned once to this response and never stored in clear.
  return { status: 'created', path: sharePath(token), base: publicBaseUrl() };
}

export function revokeShareLinks(campaignId: string, id?: string): void {
  if (!getCampaign(campaignId)) return;
  revokeShareTokens(campaignId, id || undefined);
  revalidatePath(reportPath(campaignId));
}
