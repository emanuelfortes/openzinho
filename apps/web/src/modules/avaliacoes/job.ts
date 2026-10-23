// Daily job "avaliacoes": refreshes monitored profiles and e-mails new reviews with 1 to 3 stars.
//
// Google Reviews on DataForSEO is task based, so a pass first collects the tasks posted on an
// earlier pass (task_get is free) and then posts the refreshes that are due. A profile holds at most
// one task (reserved before posting), so nothing is billed twice. Posts stop when the monthly cap of
// the client or of all clients is reached, and every post is saved in reviews_tasks, the table the
// Gastos page and the caps already count.
import { getCredentials, getProjectDataDb, getProjects, runInProjectScope, saveReviewsTask, updateReviewsTask } from '@/lib/db';
import { BudgetTracker, recordSkippedRun } from '@/modules/custos/budget';
import { recipientsForProject } from '@/modules/email/recipients';
import { sendEmail, type EmailMessage, type SendResult } from '@/modules/email/send';
import { jobTimeZone, type DailyJob, type JobResult } from '@/modules/jobs/runner';
import { buildAlertEmail, type AlertEmailItem } from './alerts';
import { getReviewsTask, postReviewsTask, type Credentials, type ListingMeta } from './dataforseo';
import {
  completeRefresh, confirmRefresh, expireStaleReservations, failRefresh, isReservation, knownReviewKeys, listAlerts,
  listMonitored, markAlerts, releaseReservation, reserveRefresh, type MonitoredListing,
} from './monitor-db';
import { classifyFetched, estimateRefreshUsd, isRefreshDue, type FetchedReview } from './monitor';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ReviewsJobDeps {
  credentials: () => Credentials | null;
  fetchImpl: FetchLike;
  /** Who gets the e-mails of one business. */
  recipients: (projectId: string) => string[] | Promise<string[]>;
  send: (message: EmailMessage) => Promise<SendResult>;
  /** Base URL of the app for the link in the e-mail, if known. */
  appUrl: string | null;
}

const defaultDeps = (): ReviewsJobDeps => ({
  credentials: getCredentials,
  fetchImpl: fetch,
  recipients: recipientsForProject,
  send: (message) => sendEmail(message),
  appUrl: (process.env.NEXO_PUBLIC_URL || process.env.BETTER_AUTH_URL)?.trim().replace(/\/+$/, '') || null,
});

/** A reservation older than this belongs to a pass that died while posting. */
const RESERVATION_TTL_MS = 30 * 60_000;

export interface CollectOutcome { collected: number; stillPending: number; failed: number; newReviews: number; newAlerts: number }

/** The task row the Avaliações do Google page keeps; that page may have collected it already. */
function storedTask(projectId: string, taskId: string): { status: string; items: FetchedReview[] } | null {
  const row = getProjectDataDb(projectId).prepare('SELECT status, result FROM reviews_tasks WHERE id = ?').get(taskId) as { status: string; result: string | null } | undefined;
  if (!row) return null;
  let items: FetchedReview[] = [];
  try { items = row.result ? JSON.parse(row.result) as FetchedReview[] : []; } catch { items = []; }
  return { status: row.status, items };
}

function absorb(projectId: string, listing: MonitoredListing, taskId: string, items: FetchedReview[], now: number): { newReviews: number; newAlerts: number } {
  const fresh = classifyFetched(items, knownReviewKeys(listing.id, projectId), !listing.baselineDone);
  completeRefresh(listing.id, taskId, fresh, items.length, { automatic: true }, projectId, now);
  return { newReviews: listing.baselineDone ? fresh.length : 0, newAlerts: fresh.filter((review) => review.alert === 'pendente').length };
}

/** Collects every finished task of a project. Free: task_get is not billed. */
export async function collectPending(projectId: string, credentials: Credentials | null, fetchImpl: FetchLike, now = Date.now()): Promise<CollectOutcome> {
  const outcome: CollectOutcome = { collected: 0, stillPending: 0, failed: 0, newReviews: 0, newAlerts: 0 };
  for (const listing of listMonitored(projectId)) {
    const taskId = listing.pendingTaskId;
    if (!taskId || isReservation(taskId)) continue;
    const stored = storedTask(projectId, taskId);
    if (stored?.status === 'ready') {
      const added = absorb(projectId, listing, taskId, stored.items, now);
      outcome.collected++; outcome.newReviews += added.newReviews; outcome.newAlerts += added.newAlerts;
      continue;
    }
    if (stored?.status === 'error') {
      failRefresh(listing.id, taskId, 'A DataForSEO não concluiu a tarefa.', projectId);
      outcome.failed++;
      continue;
    }
    if (!credentials) { outcome.stillPending++; continue; }
    const result = await getReviewsTask(credentials, taskId, fetchImpl);
    if (result.status === 'pending') { outcome.stillPending++; continue; }
    if (result.status === 'error') {
      if (stored) runInProjectScope(projectId, () => updateReviewsTask(taskId, 'error', []));
      failRefresh(listing.id, taskId, result.message, projectId);
      outcome.failed++;
      continue;
    }
    const meta: ListingMeta = result.meta;
    if (stored) runInProjectScope(projectId, () => updateReviewsTask(taskId, 'ready', result.items, result.cost ?? undefined, result.resultCount, meta));
    const added = absorb(projectId, listing, taskId, result.items, now);
    outcome.collected++; outcome.newReviews += added.newReviews; outcome.newAlerts += added.newAlerts;
  }
  return outcome;
}

export interface PostOutcome { posted: number; failed: number; budgetSkipped: number; errors: string[] }

/** Posts one task per due profile, stopping at the monthly caps. */
export async function postDueRefreshes(projectId: string, credentials: Credentials, budget: BudgetTracker, fetchImpl: FetchLike, now = Date.now()): Promise<PostOutcome> {
  const outcome: PostOutcome = { posted: 0, failed: 0, budgetSkipped: 0, errors: [] };
  const due = listMonitored(projectId).filter((listing) => isRefreshDue(listing, now));
  for (const listing of due) {
    if (budget.status(projectId).blocked) {
      outcome.budgetSkipped++;
      continue;
    }
    const token = reserveRefresh(listing.id, projectId, now);
    if (!token) continue;
    const result = await postReviewsTask(credentials, {
      placeId: listing.placeId, cid: listing.cid, keyword: listing.keyword ?? listing.title,
      location: listing.location, language: listing.language, depth: listing.depth,
    }, fetchImpl);
    if (!result.ok) {
      releaseReservation(listing.id, token, result.error, projectId);
      outcome.failed++;
      outcome.errors.push(`${listing.title}: ${result.error}`);
      continue;
    }
    // Saved before anything else can fail: this row is what the spend and the caps count.
    runInProjectScope(projectId, () => saveReviewsTask(result.taskId, listing.title, listing.location, listing.language, listing.depth, 'newest', result.cost ?? undefined));
    confirmRefresh(listing.id, token, result.taskId, projectId, now);
    budget.add(projectId, result.cost ?? estimateRefreshUsd(listing.depth));
    outcome.posted++;
  }
  if (outcome.budgetSkipped > 0) recordSkippedRun(projectId, new Date(now));
  return outcome;
}

/**
 * E-mails every "pendente" alert once, one message per business to that business's recipients
 * (its client accounts, or the global list), so a client never sees another client's reviews.
 * Alerts that could not be sent stay pending for the next pass and the UI.
 */
export async function sendPendingAlerts(deps: Pick<ReviewsJobDeps, 'recipients' | 'send' | 'appUrl'>, now = Date.now()): Promise<{ alerts: number; sent: boolean; reason: string | null }> {
  const perProject = getProjects().map((project) => ({ project, alerts: listAlerts(['pendente'], project.id) })).filter(({ alerts }) => alerts.length > 0);
  const total = perProject.reduce((sum, { alerts }) => sum + alerts.length, 0);
  if (total === 0) return { alerts: 0, sent: false, reason: null };

  let sentAny = false;
  const reasons: string[] = [];
  for (const { project, alerts } of perProject) {
    const to = await deps.recipients(project.id);
    if (to.length === 0) {
      reasons.push(`${project.name}: nenhum destinatário (ligue o cliente em Usuários ou cadastre e-mails em Configurações)`);
      continue;
    }
    const items: AlertEmailItem[] = alerts.map((alert) => ({
      projectName: project.name, listingTitle: alert.listingTitle, listingUrl: alert.listingUrl, rating: alert.rating,
      author: alert.author, publishedAt: alert.publishedAt, text: alert.text, url: alert.url,
    }));
    const email = buildAlertEmail(items, { dashboardUrl: deps.appUrl ? `${deps.appUrl}/dashboard/monitor-de-avaliacoes` : null, timeZone: jobTimeZone() });
    const result = await deps.send({ to, ...email });
    if (!result.sent) {
      reasons.push(`${project.name}: ${result.reason}`);
      continue;
    }
    sentAny = true;
    markAlerts(alerts.map((alert) => ({ monitoredId: alert.monitoredId, reviewKey: alert.reviewKey })), 'enviado', project.id, now);
  }
  return { alerts: total, sent: sentAny, reason: reasons.length ? reasons.join('; ') : null };
}

export async function runReviewsRefresh(nowDate = new Date(), deps: ReviewsJobDeps = defaultDeps()): Promise<JobResult> {
  const now = nowDate.getTime();
  const credentials = deps.credentials();
  const totals = { profiles: 0, collected: 0, stillPending: 0, posted: 0, failed: 0, budgetSkipped: 0, newReviews: 0, newAlerts: 0, dueWithoutCredentials: 0 };
  const errors: string[] = [];
  let budget: BudgetTracker | null = null;

  for (const project of getProjects()) {
    const listings = listMonitored(project.id);
    if (listings.length === 0) continue;
    totals.profiles += listings.filter((listing) => listing.active).length;
    expireStaleReservations(RESERVATION_TTL_MS, project.id, now);

    const collected = await collectPending(project.id, credentials, deps.fetchImpl, now);
    totals.collected += collected.collected; totals.stillPending += collected.stillPending; totals.failed += collected.failed;
    totals.newReviews += collected.newReviews; totals.newAlerts += collected.newAlerts;

    if (!credentials) {
      totals.dueWithoutCredentials += listMonitored(project.id).filter((listing) => isRefreshDue(listing, now)).length;
      continue;
    }
    budget ??= new BudgetTracker(nowDate);
    const posted = await postDueRefreshes(project.id, credentials, budget, deps.fetchImpl, now);
    totals.posted += posted.posted; totals.failed += posted.failed; totals.budgetSkipped += posted.budgetSkipped;
    errors.push(...posted.errors);
  }

  if (totals.profiles === 0) return { ok: true, message: 'Nenhum perfil monitorado.' };

  const alerts = await sendPendingAlerts(deps, now);
  const parts = [
    `${totals.profiles} ${totals.profiles === 1 ? 'perfil monitorado' : 'perfis monitorados'}`,
    `${totals.collected} ${totals.collected === 1 ? 'atualização coletada' : 'atualizações coletadas'}`,
    `${totals.posted} ${totals.posted === 1 ? 'tarefa enviada' : 'tarefas enviadas'}`,
  ];
  if (totals.stillPending) parts.push(`${totals.stillPending} ainda em processamento`);
  if (totals.newReviews) parts.push(`${totals.newReviews} ${totals.newReviews === 1 ? 'avaliação nova' : 'avaliações novas'}`);
  if (totals.budgetSkipped) parts.push(`${totals.budgetSkipped} ${totals.budgetSkipped === 1 ? 'pulada' : 'puladas'} pelo teto mensal`);
  if (totals.dueWithoutCredentials) parts.push(`${totals.dueWithoutCredentials} sem atualizar: credenciais da DataForSEO ausentes`);
  if (totals.failed) parts.push(`${totals.failed} com erro${errors.length ? ` (${errors.slice(0, 3).join('; ')})` : ''}`);
  if (alerts.alerts) {
    parts.push(alerts.sent
      ? `alerta enviado com ${alerts.alerts} ${alerts.alerts === 1 ? 'avaliação' : 'avaliações'} de até 3 estrelas`
      : `${alerts.alerts} ${alerts.alerts === 1 ? 'alerta pendente' : 'alertas pendentes'} no painel (${alerts.reason})`);
  }
  return { ok: totals.failed === 0 && !totals.dueWithoutCredentials, message: `${parts.join('; ')}.` };
}

export const reviewsJob: DailyJob = {
  id: 'avaliacoes',
  label: 'Avaliações monitoradas e alerta de até 3 estrelas',
  hour: 7,
  run: (now) => runReviewsRefresh(now),
};
