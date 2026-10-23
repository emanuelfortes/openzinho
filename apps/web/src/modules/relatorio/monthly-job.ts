// Monthly report e-mail: on the 1st (local day), one message per active campaign of every project,
// with the summary of the month that just ended and a fresh read-only link.
import { getProjects, runInProjectScope } from '@/lib/db';
import { listCampaigns } from '@/modules/grade/campaigns-db';
import { recipientsForProject } from '@/modules/email/recipients';
import { emailConfigured, escapeHtml, sendEmail, type EmailMessage, type SendResult } from '@/modules/email/send';
import { jobTimeZone, localDayAndHour, type DailyJob, type JobResult } from '@/modules/jobs/runner';
import { reportSummaryLines } from './analysis';
import { lastCompleteMonthKey, monthLabel } from './months';
import { buildCampaignReport } from './report-db';
import { createShareToken, publicBaseUrl, revokeShareTokensOfKind, sharePath } from './share-tokens';

export interface MonthlyReportDeps {
  send?: (message: EmailMessage) => Promise<SendResult>;
  configured?: () => boolean;
  /** Who gets the reports of one business; defaults to its client accounts or the global list. */
  recipients?: (projectId: string) => string[] | Promise<string[]>;
  baseUrl?: () => string | null;
}

export async function runMonthlyReports(now: Date, deps: MonthlyReportDeps = {}): Promise<JobResult> {
  const timeZone = jobTimeZone();
  if (!localDayAndHour(now, timeZone).day.endsWith('-01')) return { ok: true, message: 'Não é dia 1.' };
  if (!(deps.configured ?? emailConfigured)()) return { ok: false, message: 'E-mail não configurado (SMTP_HOST e SMTP_FROM).' };
  const recipients = deps.recipients ?? recipientsForProject;
  const targets = await Promise.all(getProjects().map(async (project) => ({ project, to: await recipients(project.id) })));
  if (targets.every((target) => target.to.length === 0)) {
    return { ok: false, message: 'Nenhum destinatário: ligue o cliente ao negócio em Usuários ou cadastre e-mails em Configurações.' };
  }
  const send = deps.send ?? ((message: EmailMessage) => sendEmail(message));
  const base = (deps.baseUrl ?? publicBaseUrl)();
  const month = lastCompleteMonthKey(now, timeZone);

  let sent = 0;
  const failures: string[] = [];
  // Each business e-mails its own client accounts (or the global list when it has none).
  for (const { project, to } of targets) {
    if (to.length === 0) continue;
    const campaigns = runInProjectScope(project.id, () => listCampaigns().filter((campaign) => campaign.active));
    for (const campaign of campaigns) {
      const { report, token } = runInProjectScope(project.id, () => ({
        report: buildCampaignReport(campaign, month, now.getTime()),
        token: base ? createShareToken(campaign.id, 'email', project.id) : null,
      }));
      const lines = reportSummaryLines(report);
      const link = token && base ? `${base}${sharePath(token, month)}` : null;
      const footer = link
        ? `Relatório completo (somente leitura, sem login): ${link}`
        : 'Link do relatório não incluído: defina NEXO_PUBLIC_URL para enviar o endereço público.';
      const text = [...lines, '', footer, '', `Projeto: ${project.name}. Medições do Geo-Grid; hipóteses e recomendações estão no relatório completo.`].join('\n');
      const html = [
        `<p><strong>${escapeHtml(lines[0])}</strong></p>`,
        `<p>${lines.slice(1).map(escapeHtml).join('<br>')}</p>`,
        link ? `<p><a href="${escapeHtml(link)}">Abrir o relatório completo</a> (somente leitura, sem login)</p>` : `<p>${escapeHtml(footer)}</p>`,
        `<p style="color:#64748b;font-size:12px">Projeto: ${escapeHtml(project.name)}. Medições do Geo-Grid; hipóteses e recomendações estão no relatório completo.</p>`,
      ].join('\n');
      const result = await send({ to, subject: `Relatório mensal: ${campaign.name} - ${report.monthLabel}`, text, html });
      if (result.sent) {
        sent += 1;
      } else {
        failures.push(`${campaign.name}: ${result.reason}`);
        // A link nobody received should not stay valid.
        if (token) revokeShareTokensOfKind(campaign.id, 'email', project.id);
      }
    }
  }

  const noLink = base ? '' : ' Sem link: NEXO_PUBLIC_URL não definido.';
  if (sent === 0 && failures.length === 0) return { ok: true, message: `Nenhuma campanha ativa.${noLink}` };
  if (failures.length) return { ok: false, message: `${sent} enviado(s), ${failures.length} com falha: ${failures.slice(0, 3).join('; ')}.${noLink}` };
  return { ok: true, message: `${sent} relatório(s) de ${monthLabel(month)} enviado(s).${noLink}` };
}

export const monthlyReportJob: DailyJob = {
  id: 'relatorio-mensal',
  label: 'Relatório mensal por e-mail',
  hour: 8,
  run: (now) => runMonthlyReports(now),
};
