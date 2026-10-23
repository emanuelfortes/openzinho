// Billing state of each business and the handling of Mercado Pago notifications.
// The subscription status in Assinaturas (modules/planos) is what the rest of the app obeys;
// this module only moves it: authorized → ativo, paused/cancelled or a charge given up on → suspenso.
import type Database from 'better-sqlite3';
import { getControlDataDb, getProjects, projectExists } from '@/lib/db';
import { getSubscription, PLANS, saveSubscription, DEFAULT_PLAN } from '@/modules/planos/plans-db';
import {
  createSubscription, getAuthorizedPayment, getSubscriptionFromMp, outcomeOfCharge, outcomeOfSubscription,
  type BillingOutcome, type Preapproval,
} from './mercadopago';

export interface BusinessBilling {
  projectId: string;
  provider: 'mercadopago';
  subscriptionId: string;
  mpStatus: string;
  payerEmail: string;
  checkoutUrl: string;
  updatedAt: number;
}

export interface BillingEvent {
  projectId: string;
  kind: string;
  detail: string;
  at: number;
}

const initialised = new WeakSet<Database.Database>();

function db(): Database.Database {
  const handle = getControlDataDb();
  if (!initialised.has(handle)) {
    handle.exec(`
      CREATE TABLE IF NOT EXISTS project_billing (
        project_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        mp_status TEXT NOT NULL,
        payer_email TEXT NOT NULL,
        checkout_url TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS project_billing_subscription ON project_billing (subscription_id);
      CREATE TABLE IF NOT EXISTS billing_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        detail TEXT NOT NULL,
        at INTEGER NOT NULL
      );
    `);
    initialised.add(handle);
  }
  return handle;
}

type BillingRow = { project_id: string; provider: string; subscription_id: string; mp_status: string; payer_email: string; checkout_url: string; updated_at: number };

const fromRow = (row: BillingRow): BusinessBilling => ({
  projectId: row.project_id, provider: 'mercadopago', subscriptionId: row.subscription_id, mpStatus: row.mp_status,
  payerEmail: row.payer_email, checkoutUrl: row.checkout_url, updatedAt: row.updated_at,
});

export function getBilling(projectId: string): BusinessBilling | null {
  const row = db().prepare('SELECT * FROM project_billing WHERE project_id = ?').get(projectId) as BillingRow | undefined;
  return row ? fromRow(row) : null;
}

export function listBilling(): Map<string, BusinessBilling> {
  return new Map((db().prepare('SELECT * FROM project_billing').all() as BillingRow[]).map((row) => [row.project_id, fromRow(row)]));
}

function saveBilling(projectId: string, preapproval: Preapproval, payerEmail: string, now: number): void {
  db().prepare(`INSERT INTO project_billing (project_id, provider, subscription_id, mp_status, payer_email, checkout_url, updated_at)
    VALUES (?, 'mercadopago', ?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET subscription_id = excluded.subscription_id, mp_status = excluded.mp_status,
      payer_email = excluded.payer_email, checkout_url = excluded.checkout_url, updated_at = excluded.updated_at`)
    .run(projectId, preapproval.id, preapproval.status ?? 'pending', payerEmail, preapproval.init_point ?? '', now);
}

export function logBillingEvent(projectId: string, kind: string, detail: string, now = Date.now()): void {
  db().prepare('INSERT INTO billing_events (project_id, kind, detail, at) VALUES (?, ?, ?, ?)').run(projectId, kind, detail.slice(0, 300), now);
}

export function listBillingEvents(projectId: string, limit = 20): BillingEvent[] {
  return (db().prepare('SELECT project_id, kind, detail, at FROM billing_events WHERE project_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(projectId, limit) as Array<{ project_id: string; kind: string; detail: string; at: number }>)
    .map((row) => ({ projectId: row.project_id, kind: row.kind, detail: row.detail, at: row.at }));
}

type Deps = Parameters<typeof createSubscription>[1];

/**
 * Checkout link for a business: reuses a pending one, otherwise creates a new subscription at
 * Mercado Pago for the business's plan. Returns the link to send the customer to.
 */
export async function startCheckout(
  input: { projectId: string; payerEmail: string; backUrl: string }, deps?: Deps, now = Date.now(),
): Promise<string> {
  const project = getProjects().find((item) => item.id === input.projectId);
  if (!project) throw new Error('Negócio não encontrado.');
  const existing = getBilling(input.projectId);
  if (existing && existing.mpStatus === 'pending' && existing.checkoutUrl && existing.payerEmail === input.payerEmail.toLowerCase()) {
    return existing.checkoutUrl;
  }
  if (existing && existing.mpStatus === 'authorized') throw new Error('Este negócio já tem uma assinatura ativa no Mercado Pago.');
  const plan = PLANS[getSubscription(input.projectId)?.plan ?? DEFAULT_PLAN];
  const preapproval = await createSubscription({
    projectId: input.projectId, businessName: project.name, plan, payerEmail: input.payerEmail.toLowerCase(), backUrl: input.backUrl,
  }, deps);
  if (!preapproval.init_point) throw new Error('O Mercado Pago não devolveu o link de pagamento.');
  saveBilling(input.projectId, preapproval, input.payerEmail.toLowerCase(), now);
  // Keep the plan the customer is paying for on record (status stays as the team set it until payment).
  if (!getSubscription(input.projectId)) saveSubscription(input.projectId, plan.id, 'teste', 'aguardando o primeiro pagamento');
  logBillingEvent(input.projectId, 'link', `Link de pagamento criado para ${input.payerEmail.toLowerCase()} (${plan.name}).`, now);
  return preapproval.init_point;
}

/** Applies an outcome to the business's subscription status in Assinaturas. */
function applyOutcome(projectId: string, outcome: BillingOutcome, detail: string, now: number): void {
  const current = getSubscription(projectId);
  const plan = current?.plan ?? DEFAULT_PLAN;
  if (outcome === 'ativo' && current?.status !== 'ativo') saveSubscription(projectId, plan, 'ativo', current?.note ?? '');
  if (outcome === 'suspenso' && current?.status !== 'suspenso') saveSubscription(projectId, plan, 'suspenso', current?.note ?? '');
  logBillingEvent(projectId, outcome ?? 'aviso', detail, now);
}

export interface NotificationResult {
  handled: boolean;
  projectId?: string;
  outcome?: BillingOutcome;
  reason?: string;
}

/**
 * Handles one Mercado Pago notification after its signature was checked. The notification only
 * says "something changed"; the current state is always re-read from the API.
 */
export async function handleNotification(type: string, dataId: string, deps?: Deps, now = Date.now()): Promise<NotificationResult> {
  if (type === 'subscription_preapproval' || type === 'preapproval') {
    const preapproval = await getSubscriptionFromMp(dataId, deps);
    return applySubscription(preapproval, now);
  }
  if (type === 'subscription_authorized_payment' || type === 'authorized_payment') {
    const payment = await getAuthorizedPayment(dataId, deps);
    if (!payment.preapproval_id) return { handled: false, reason: 'cobrança sem assinatura' };
    const preapproval = await getSubscriptionFromMp(payment.preapproval_id, deps);
    const projectId = projectOf(preapproval);
    if (!projectId) return { handled: false, reason: 'assinatura sem negócio conhecido' };
    saveBilling(projectId, preapproval, preapproval.payer_email ?? getBilling(projectId)?.payerEmail ?? '', now);
    const outcome = outcomeOfCharge(payment);
    const status = payment.payment?.status ?? payment.status ?? 'desconhecido';
    applyOutcome(projectId, outcome, `Cobrança ${payment.id}: ${status}.`, now);
    return { handled: true, projectId, outcome };
  }
  return { handled: false, reason: `tipo ${type} ignorado` };
}

function projectOf(preapproval: Preapproval): string | null {
  const reference = preapproval.external_reference ?? '';
  if (reference && projectExists(reference)) return reference;
  const row = db().prepare('SELECT project_id FROM project_billing WHERE subscription_id = ?').get(preapproval.id) as { project_id: string } | undefined;
  return row?.project_id ?? null;
}

function applySubscription(preapproval: Preapproval, now: number): NotificationResult {
  const projectId = projectOf(preapproval);
  if (!projectId) return { handled: false, reason: 'assinatura sem negócio conhecido' };
  saveBilling(projectId, preapproval, preapproval.payer_email ?? getBilling(projectId)?.payerEmail ?? '', now);
  const outcome = outcomeOfSubscription(preapproval.status);
  applyOutcome(projectId, outcome === 'pendente' ? null : outcome, `Assinatura ${preapproval.id}: ${preapproval.status}.`, now);
  return { handled: true, projectId, outcome };
}
