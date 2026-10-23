// Mercado Pago recurring billing ("Assinaturas", preapproval API). Off until MERCADOPAGO_ACCESS_TOKEN
// is set: with a TEST- token everything runs against Mercado Pago's test environment.
//
// One subscription per business, created without an associated plan and with status "pending":
// Mercado Pago returns a checkout link (init_point) where the customer pays, so the Nexo never
// handles card data. external_reference carries the business id, which is how notifications are
// matched back to the business. Card is the method confirmed for automatic monthly charges.
import { createHmac, timingSafeEqual } from 'crypto';
import type { PlanDefinition } from '@/modules/planos/plans';

const API = 'https://api.mercadopago.com';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function mercadoPagoToken(env: Record<string, string | undefined> = process.env): string | null {
  return env.MERCADOPAGO_ACCESS_TOKEN?.trim() || null;
}

export function mercadoPagoConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return mercadoPagoToken(env) !== null;
}

/** True with a TEST- access token (Mercado Pago's test environment, nothing is charged). */
export function mercadoPagoTestMode(env: Record<string, string | undefined> = process.env): boolean {
  return mercadoPagoToken(env)?.startsWith('TEST-') ?? false;
}

export interface Preapproval {
  id: string;
  status: string;
  external_reference?: string | null;
  payer_email?: string | null;
  init_point?: string | null;
  reason?: string | null;
  next_payment_date?: string | null;
  auto_recurring?: { transaction_amount?: number; currency_id?: string } | null;
}

export interface AuthorizedPayment {
  id: string | number;
  preapproval_id?: string | null;
  status?: string | null;
  payment?: { id?: string | number; status?: string | null } | null;
}

export class MercadoPagoError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit, deps: { token?: string | null; fetchImpl?: FetchLike } = {}): Promise<T> {
  const token = deps.token ?? mercadoPagoToken();
  if (!token) throw new MercadoPagoError('O Mercado Pago não está configurado (MERCADOPAGO_ACCESS_TOKEN).');
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new MercadoPagoError('Não foi possível falar com o Mercado Pago. Tente de novo em instantes.');
  }
  const body = await response.json().catch(() => null) as (T & { message?: string }) | null;
  if (!response.ok || !body) {
    throw new MercadoPagoError(`O Mercado Pago recusou o pedido (${response.status}${body?.message ? `: ${body.message}` : ''}).`, response.status);
  }
  return body;
}

/** Monthly subscription for one business; the customer authorizes it at the returned init_point. */
export function createSubscription(
  input: { projectId: string; businessName: string; plan: PlanDefinition; payerEmail: string; backUrl: string },
  deps?: { token?: string | null; fetchImpl?: FetchLike },
): Promise<Preapproval> {
  return call<Preapproval>('/preapproval', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Nexo ${input.plan.name} · ${input.businessName}`.slice(0, 120),
      external_reference: input.projectId,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: 'pending',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: input.plan.priceBrl, currency_id: 'BRL' },
    }),
  }, deps);
}

export function getSubscriptionFromMp(id: string, deps?: { token?: string | null; fetchImpl?: FetchLike }): Promise<Preapproval> {
  return call<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: 'GET' }, deps);
}

export function cancelSubscriptionAtMp(id: string, deps?: { token?: string | null; fetchImpl?: FetchLike }): Promise<Preapproval> {
  return call<Preapproval>(`/preapproval/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) }, deps);
}

export function getAuthorizedPayment(id: string, deps?: { token?: string | null; fetchImpl?: FetchLike }): Promise<AuthorizedPayment> {
  return call<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`, { method: 'GET' }, deps);
}

// ─── Notifications ──────────────────────────────────────────────────────────

/**
 * Checks Mercado Pago's x-signature header ("ts=...,v1=..."): v1 is the HMAC-SHA256, with the
 * webhook secret, of "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (parts without a value are
 * left out). data.id comes from the notification URL and is lowercased when alphanumeric.
 */
export function verifyNotificationSignature(input: {
  signature: string | null; requestId: string | null; dataId: string | null; secret: string;
}): boolean {
  if (!input.signature || !input.secret) return false;
  const parts = Object.fromEntries(input.signature.split(',').map((part) => {
    const [key, ...rest] = part.split('=');
    return [key.trim(), rest.join('=').trim()];
  }));
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const id = input.dataId && /^[a-z0-9]+$/i.test(input.dataId) ? input.dataId.toLowerCase() : input.dataId;
  const manifest = `${id ? `id:${id};` : ''}${input.requestId ? `request-id:${input.requestId};` : ''}ts:${ts};`;
  const expected = createHmac('sha256', input.secret).update(manifest).digest('hex');
  const given = Buffer.from(v1, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export type BillingOutcome = 'ativo' | 'suspenso' | 'pendente' | null;

/** What a subscription status means for the business (null = no change). */
export function outcomeOfSubscription(status: string | null | undefined): BillingOutcome {
  switch ((status ?? '').toLowerCase()) {
    case 'authorized': return 'ativo';
    case 'paused':
    case 'cancelled':
    case 'canceled': return 'suspenso';
    case 'pending': return 'pendente';
    default: return null;
  }
}

/**
 * What one charge means. An approved charge keeps the business active; a charge Mercado Pago gave
 * up on (cancelled after its own retries) suspends it. Charges still being retried change nothing.
 */
export function outcomeOfCharge(payment: AuthorizedPayment): BillingOutcome {
  const paymentStatus = (payment.payment?.status ?? '').toLowerCase();
  const status = (payment.status ?? '').toLowerCase();
  if (paymentStatus === 'approved') return 'ativo';
  if (status === 'cancelled' || status === 'canceled') return 'suspenso';
  return null;
}

/** pt-BR label of a Mercado Pago subscription status, for the screens. */
export function subscriptionStatusLabel(status: string | null | undefined): string {
  switch ((status ?? '').toLowerCase()) {
    case 'authorized': return 'Pagamento autorizado';
    case 'pending': return 'Aguardando o pagamento';
    case 'paused': return 'Pausada no Mercado Pago';
    case 'cancelled':
    case 'canceled': return 'Cancelada no Mercado Pago';
    default: return status ? `Mercado Pago: ${status}` : 'Sem cobrança';
  }
}
