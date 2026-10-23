// Who receives alerts and reports. With accounts, each business e-mails its own client accounts;
// the global list in Configurações is the fallback (businesses without a client, local installs).
import { getSetting, setSetting } from '@/lib/db';
import { authEnabled } from '@/lib/auth-config';
import { platformRole } from '@/lib/access-policy';
import { parseRecipients } from './send';

export const ALERT_EMAILS_KEY = 'alert_emails';

export function getAlertRecipients(): string[] {
  return parseRecipients(getSetting(ALERT_EMAILS_KEY));
}

export function saveAlertRecipients(raw: string | null): void {
  setSetting(ALERT_EMAILS_KEY, parseRecipients(raw).join(', '));
}

/** Pure part: e-mails of the active client accounts linked to the business, else the global list. */
export function pickRecipients(
  linkedUserIds: string[],
  accounts: Array<{ id: string; email: string; role: string; banned: boolean }>,
  fallback: string[],
): string[] {
  const linked = new Set(linkedUserIds);
  const clients = accounts
    .filter((account) => linked.has(account.id) && !account.banned && platformRole(account.role) === 'cliente')
    .map((account) => account.email.toLowerCase());
  return clients.length > 0 ? [...new Set(clients)] : fallback;
}

/** Recipients for one business: its client accounts, or the global list when it has none. */
export async function recipientsForProject(projectId: string): Promise<string[]> {
  const fallback = getAlertRecipients();
  if (!authEnabled()) return fallback;
  const [{ listAccounts }, { membersByProject }] = await Promise.all([import('@/lib/auth'), import('@/lib/access')]);
  return pickRecipients(membersByProject().get(projectId) ?? [], await listAccounts(), fallback);
}
