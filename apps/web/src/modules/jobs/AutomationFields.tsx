// Configurações → "Avisos e tarefas automáticas": alert recipients, e-mail status and the
// last result of each daily job. Rendered inside the settings form (server component).
import { emailConfigured } from '@/modules/email/send';
import { getAlertRecipients } from '@/modules/email/recipients';
import { backupDir, keepDays } from '@/modules/backup/backup';
import { DAILY_JOBS } from './registry';
import { getJobState, jobTimeZone } from './runner';

function formatWhen(ts: number, timeZone: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(ts));
}

export default function AutomationFields() {
  const timeZone = jobTimeZone();
  const smtp = emailConfigured();
  return (
    <div className="space-y-5">
      <label className="block">
        <span className="nexo-label mb-1.5 block">E-mails que recebem alertas e relatórios</span>
        <textarea
          name="alert_emails"
          rows={2}
          defaultValue={getAlertRecipients().join(', ')}
          placeholder="voce@agencia.com.br, equipe@agencia.com.br"
          className="nexo-input min-w-0 w-full px-4 py-3 text-sm"
        />
        <span className="mt-1 block text-[11px] text-nexo-faint">Separe por vírgula. Endereços inválidos são descartados ao salvar.</span>
      </label>

      <div className={`rounded-nexo border px-4 py-3 text-xs ${smtp ? 'border-nexo-border text-nexo-dim' : 'border-nexo-warn/40 text-nexo-warn-text'}`}>
        {smtp
          ? 'Envio de e-mail configurado no servidor.'
          : 'Envio de e-mail desligado. Defina SMTP_HOST, SMTP_FROM e, se o servidor pedir, SMTP_USER, SMTP_PASS e SMTP_PORT no ambiente do servidor.'}
      </div>

      <div>
        <p className="nexo-label mb-2">Tarefas diárias ({timeZone.replace('_', ' ')})</p>
        <ul className="divide-y divide-nexo-border rounded-nexo border border-nexo-border">
          {DAILY_JOBS.map((job) => {
            const state = getJobState(job.id);
            return (
              <li key={job.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-xs">
                <div className="min-w-0">
                  <p className="text-nexo-text">{job.label}</p>
                  <p className="text-nexo-faint">A partir das {String(job.hour).padStart(2, '0')}h, uma vez por dia.</p>
                  {state && <p className={`mt-1 break-words ${state.ok ? 'text-nexo-dim' : 'text-nexo-danger-text'}`}>{state.message}</p>}
                </div>
                <span className={`shrink-0 font-mono ${state ? (state.ok ? 'text-nexo-ice' : 'text-nexo-danger-text') : 'text-nexo-faint'}`}>
                  {state ? `${state.ok ? 'ok' : 'falhou'} · ${formatWhen(state.at, timeZone)}` : 'ainda não rodou'}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-nexo-faint">
          Backups em {backupDir()}, guardados por {keepDays()} dias (BACKUP_DIR e BACKUP_KEEP_DAYS mudam isso). As tarefas rodam pelo worker que sobe junto com o app.
        </p>
      </div>
    </div>
  );
}
