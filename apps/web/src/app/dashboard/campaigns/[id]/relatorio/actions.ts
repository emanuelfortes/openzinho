'use server';

import { runWithCurrentProject } from '@/lib/db';
import { createShareLink, revokeShareLinks, type ShareLinkState } from '@/modules/relatorio/share-actions';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createShareLinkAction(_previous: ShareLinkState, formData: FormData): Promise<ShareLinkState> {
  return runWithCurrentProject(() => createShareLink(text(formData, 'campaign_id')));
}

export async function revokeShareLinksAction(formData: FormData): Promise<void> {
  return runWithCurrentProject(() => revokeShareLinks(text(formData, 'campaign_id'), text(formData, 'id')));
}
