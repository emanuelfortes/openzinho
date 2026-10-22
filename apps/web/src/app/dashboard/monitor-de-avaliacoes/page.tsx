import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getCredentials, getCurrentProject } from '@/lib/db';
import PendingButton from '@/components/PendingButton';
import LocationPicker from '@/components/LocationPicker';
import { LANGUAGES } from '@/lib/geo-options';
import { getAlertRecipients } from '@/modules/email/recipients';
import { emailConfigured } from '@/modules/email/send';
import { getBudgetStatus } from '@/modules/custos/budget';
import { getJobState } from '@/modules/jobs/runner';
import { formatDuration, MINUTES_PER_MANUAL_CHECK, timeSavedMinutes } from '@/modules/avaliacoes/metrics';
import { estimateMonthlyUsd, estimateRefreshUsd, excerpt, FREQUENCIES, defaultDepth } from '@/modules/avaliacoes/monitor';
import { automaticRefreshCount, isReservation, listAlerts, listMonitored, type MonitoredListing, type ReviewAlert } from '@/modules/avaliacoes/monitor-db';
import {
  collectNowAction, dismissAlertAction, dismissAllAlertsAction, monitorManualAction, removeMonitoredAction, setFrequencyAction, toggleActiveAction,
} from './actions';

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2 text-sm outline-none focus:border-nexo-sky';
const usd = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });

function formatDate(ts: number | null) {
  return ts ? new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Nunca';
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-nexo-faint">sem nota</span>;
  const full = Math.round(rating);
  return <span className="text-nexo-warn-text" aria-label={`${rating} de 5 estrelas`}>{'★'.repeat(full)}<span className="text-nexo-faint">{'★'.repeat(5 - full)}</span></span>;
}

function AlertRow({ alert, pending }: { alert: ReviewAlert; pending: boolean }) {
  const link = alert.url ?? alert.listingUrl;
  return (
    <li className="px-5 py-3.5 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Stars rating={alert.rating} />
        <span className="font-medium text-nexo-text">{alert.author}</span>
        <span className="text-nexo-faint">· {alert.listingTitle} · {formatDate(alert.publishedAt)}</span>
        {!pending && <span className="nexo-label ml-auto">{alert.alert === 'enviado' ? 'Enviado por e-mail' : 'Visto'}</span>}
      </div>
      {alert.text && <p className="text-sm text-nexo-dim leading-relaxed">{excerpt(alert.text, 300)}</p>}
      <div className="flex items-center gap-4">
        {link && <a href={link} target="_blank" rel="noopener noreferrer" className="nexo-section hover:text-white">Abrir no Google</a>}
        {pending && (
          <form action={dismissAlertAction}>
            <input type="hidden" name="id" value={alert.monitoredId} />
            <input type="hidden" name="key" value={alert.reviewKey} />
            <button type="submit" className="nexo-label hover:text-white">Marcar como visto</button>
          </form>
        )}
      </div>
    </li>
  );
}

function ListingRow({ listing }: { listing: MonitoredListing }) {
  const pending = listing.pendingTaskId && !isReservation(listing.pendingTaskId);
  return (
    <tr className="border-b border-nexo-border last:border-0 align-top">
      <td className="py-3 pr-3">
        <p className="font-medium text-nexo-text">{listing.title}</p>
        <p className="text-[11px] text-nexo-faint font-mono break-all">
          {listing.placeId ? `place ID ${listing.placeId}` : listing.cid ? `CID ${listing.cid}` : `nome: ${listing.keyword}`}
        </p>
        <p className="text-[11px] text-nexo-faint">{listing.location} · {listing.language}{listing.active ? '' : ' · pausado'}</p>
        {listing.lastError && <p className="text-[11px] text-nexo-danger-text mt-1">{listing.lastError}</p>}
      </td>
      <td className="py-3 pr-3">
        <form action={setFrequencyAction} className="flex items-center gap-2">
          <input type="hidden" name="id" value={listing.id} />
          <select name="frequency" defaultValue={listing.frequency} className="nexo-input px-2 py-1 text-xs" aria-label="Frequência">
            {FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="submit" className="nexo-label hover:text-white">Salvar</button>
        </form>
        <p className="text-[11px] text-nexo-faint mt-1">{listing.depth} avaliações por vez</p>
      </td>
      <td className="py-3 pr-3 text-nexo-dim text-xs">
        <p>{formatDate(listing.lastRefreshAt)}</p>
        {pending && <p className="text-nexo-warn-text">Tarefa em processamento</p>}
      </td>
      <td className="py-3 pr-3 text-right font-mono text-xs text-nexo-ice">
        {usd(estimateMonthlyUsd(listing.frequency, listing.depth))}
        <p className="text-[10px] text-nexo-faint font-sans">por mês (estimativa)</p>
      </td>
      <td className="py-3 text-right">
        <div className="flex flex-col items-end gap-1.5">
          <Link href={`/dashboard/pedido-de-avaliacao?monitorado=${listing.id}`} className="nexo-section hover:text-white">Kit de pedido</Link>
          <form action={toggleActiveAction}>
            <input type="hidden" name="id" value={listing.id} />
            <input type="hidden" name="active" value={listing.active ? '0' : '1'} />
            <button type="submit" className="nexo-label hover:text-white">{listing.active ? 'Pausar' : 'Retomar'}</button>
          </form>
          <form action={removeMonitoredAction}>
            <input type="hidden" name="id" value={listing.id} />
            <button type="submit" className="nexo-label text-nexo-danger-text hover:text-white">Remover</button>
          </form>
        </div>
      </td>
    </tr>
  );
}

async function MonitorDeAvaliacoesPage() {
  const project = getCurrentProject();
  const listings = listMonitored();
  const pendingAlerts = listAlerts(['pendente']);
  const pastAlerts = listAlerts(['enviado', 'visto'], undefined, 20);
  const creds = getCredentials();
  const smtp = emailConfigured();
  const recipients = getAlertRecipients();
  const budget = getBudgetStatus(project.id);
  const job = getJobState('avaliacoes');
  const checks = automaticRefreshCount();
  const hasPendingTasks = listings.some((listing) => listing.pendingTaskId && !isReservation(listing.pendingTaskId));
  const activeListings = listings.filter((listing) => listing.active);
  const monthlyTotal = activeListings.reduce((sum, listing) => sum + estimateMonthlyUsd(listing.frequency, listing.depth), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Monitor de avaliações</h1>
        <p className="text-sm text-nexo-faint mt-1">
          Atualiza as avaliações dos perfis escolhidos todo dia às 7h (diária ou semanal) e avisa por e-mail quando chega uma avaliação nova de 1 a 3 estrelas.
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <div className="nexo-panel px-4 py-3">
          <p className="nexo-label mb-1">Perfis monitorados</p>
          <p className="nexo-metric font-mono text-2xl">{activeListings.length}</p>
          <p className="text-[11px] text-nexo-faint">Custo estimado: {usd(monthlyTotal)} por mês</p>
        </div>
        <div className="nexo-panel px-4 py-3">
          <p className="nexo-label mb-1">Alertas pendentes</p>
          <p className="nexo-metric font-mono text-2xl">{pendingAlerts.length}</p>
          <p className="text-[11px] text-nexo-faint">Avaliações novas de até 3 estrelas ainda não enviadas</p>
        </div>
        <div className="nexo-panel px-4 py-3">
          <p className="nexo-label mb-1">Tempo economizado (estimativa)</p>
          <p className="nexo-metric font-mono text-2xl">{formatDuration(timeSavedMinutes(checks))}</p>
          <p className="text-[11px] text-nexo-faint">
            {checks} {checks === 1 ? 'verificação automática' : 'verificações automáticas'} × {MINUTES_PER_MANUAL_CHECK} min que levaria abrir o perfil e ler as novas avaliações à mão
          </p>
        </div>
      </div>

      <div className="nexo-panel px-5 py-4 text-xs text-nexo-dim space-y-1.5">
        <p>
          <span className="nexo-label mr-2">DataForSEO</span>
          {creds ? 'Credenciais configuradas.' : <>Credenciais ausentes: nada é atualizado. <Link href="/dashboard/settings" className="underline">Configurar</Link></>}
        </p>
        <p>
          <span className="nexo-label mr-2">E-mail</span>
          {!smtp
            ? 'SMTP não configurado: os alertas ficam pendentes nesta página.'
            : recipients.length === 0
              ? <>Nenhum destinatário de alertas: os alertas ficam pendentes nesta página. <Link href="/dashboard/settings" className="underline">Adicionar destinatário</Link></>
              : `Alertas vão para ${recipients.join(', ')}.`}
        </p>
        {budget.blocked && <p className="text-nexo-danger-text">{budget.reason} As atualizações automáticas ficam paradas até o mês seguinte.</p>}
        <p>
          <span className="nexo-label mr-2">Última execução</span>
          {job ? `${new Date(job.at).toLocaleString('pt-BR')}: ${job.message}` : 'Ainda não rodou.'}
        </p>
        <p className="text-nexo-faint">
          A Google Reviews da DataForSEO funciona por tarefas: a atualização é enviada numa execução e coletada na seguinte (ou ao abrir Avaliações do Google). Cada perfil tem no máximo uma tarefa por vez, então nada é cobrado duas vezes. Os valores são estimativas da fila padrão (US$ 0,00075 a cada 10 avaliações); a cobrança real é a que a DataForSEO informa em Gastos.
        </p>
        {hasPendingTasks && creds && (
          <form action={collectNowAction} className="pt-1">
            <PendingButton type="submit" className="nexo-btn-ghost px-3 py-1.5" pendingChildren="Verificando…">Verificar tarefas prontas (sem custo)</PendingButton>
          </form>
        )}
      </div>

      <section className="nexo-panel overflow-hidden">
        <div className="px-5 py-4 border-b border-nexo-border flex items-center justify-between gap-3">
          <h2 className="nexo-label">Alertas pendentes</h2>
          {pendingAlerts.length > 1 && (
            <form action={dismissAllAlertsAction}>
              <button type="submit" className="nexo-label hover:text-white">Marcar todos como vistos</button>
            </form>
          )}
        </div>
        {pendingAlerts.length === 0
          ? <p className="px-5 py-6 text-sm text-nexo-faint">Nenhuma avaliação nova de até 3 estrelas.</p>
          : <ul className="divide-y divide-nexo-border">{pendingAlerts.map((alert) => <AlertRow key={`${alert.monitoredId}:${alert.reviewKey}`} alert={alert} pending />)}</ul>}
      </section>

      <section className="nexo-panel overflow-hidden">
        <div className="px-5 py-4 border-b border-nexo-border">
          <h2 className="nexo-label">Perfis monitorados</h2>
        </div>
        {listings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-nexo-faint">
            Nenhum perfil ainda. Busque as avaliações em <Link href="/dashboard/google-reviews" className="underline">Avaliações do Google</Link> e clique em &quot;Monitorar este perfil&quot;, ou adicione um abaixo.
          </p>
        ) : (
          <div className="overflow-x-auto px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nexo-border text-left">
                  <th className="nexo-label py-2.5 pr-3 font-normal">Perfil</th>
                  <th className="nexo-label py-2.5 pr-3 font-normal">Frequência</th>
                  <th className="nexo-label py-2.5 pr-3 font-normal">Última atualização</th>
                  <th className="nexo-label py-2.5 pr-3 font-normal text-right">Custo</th>
                  <th className="py-2.5" />
                </tr>
              </thead>
              <tbody>{listings.map((listing) => <ListingRow key={listing.id} listing={listing} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="nexo-panel p-5 space-y-4">
        <h2 className="nexo-label">Adicionar perfil</h2>
        <form action={monitorManualAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="nexo-label block mb-1.5">Nome do perfil</span>
            <input name="title" className={fieldCls} placeholder="ex.: Clínica Sorriso Centro" />
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Place ID ou CID</span>
            <input name="identifier" className={fieldCls} placeholder="ex.: ChIJN1t_tDeuEmsRUsoyG83frY4" />
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Local</span>
            <LocationPicker name="location" className={fieldCls} defaultValue={project.defaultLocation || 'Brazil'} placeholder="ex.: São Paulo, Brasil" />
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Idioma</span>
            <select name="language" className={fieldCls} defaultValue={project.defaultLanguage || 'Portuguese'}>
              {LANGUAGES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="nexo-label block mb-1.5">Frequência</span>
            <select name="frequency" defaultValue="semanal" className={fieldCls}>
              {FREQUENCIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <div className="text-[11px] text-nexo-faint self-end">
            Estimativa: diária {usd(estimateRefreshUsd(defaultDepth('diaria')))} por atualização ({usd(estimateMonthlyUsd('diaria', defaultDepth('diaria')))} por mês);
            semanal {usd(estimateRefreshUsd(defaultDepth('semanal')))} por atualização ({usd(estimateMonthlyUsd('semanal', defaultDepth('semanal')))} por mês).
            Sem place ID ou CID, a busca é feita pelo nome e pode trazer outro perfil. A primeira atualização só registra as avaliações existentes, sem alertar.
          </div>
          <div className="sm:col-span-2">
            <PendingButton type="submit" className="nexo-btn-primary px-4 py-2.5" pendingChildren="Salvando…">Monitorar perfil</PendingButton>
          </div>
        </form>
      </section>

      {pastAlerts.length > 0 && (
        <section className="nexo-panel overflow-hidden">
          <div className="px-5 py-4 border-b border-nexo-border">
            <h2 className="nexo-label">Alertas anteriores</h2>
          </div>
          <ul className="divide-y divide-nexo-border">{pastAlerts.map((alert) => <AlertRow key={`${alert.monitoredId}:${alert.reviewKey}`} alert={alert} pending={false} />)}</ul>
        </section>
      )}
    </div>
  );
}

export default withProjectScope(MonitorDeAvaliacoesPage);
