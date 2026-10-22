// Who receives alerts and reports: one global list, edited in Configurações.
import { getSetting, setSetting } from '@/lib/db';
import { parseRecipients } from './send';

export const ALERT_EMAILS_KEY = 'alert_emails';

export function getAlertRecipients(): string[] {
  return parseRecipients(getSetting(ALERT_EMAILS_KEY));
}

export function saveAlertRecipients(raw: string | null): void {
  setSetting(ALERT_EMAILS_KEY, parseRecipients(raw).join(', '));
}
