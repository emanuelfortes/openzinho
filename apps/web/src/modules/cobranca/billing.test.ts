import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-billing-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, createProject } from '@/lib/db';
import { getSubscription, saveSubscription } from '@/modules/planos/plans-db';
import { getBilling, handleNotification, listBillingEvents, startCheckout } from './billing';

let clinic: string;
const preapprovals = new Map<string, Record<string, unknown>>();
const payments = new Map<string, Record<string, unknown>>();

/** Stand-in for the Mercado Pago API. */
const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
  const { pathname } = new URL(url);
  if (pathname === '/preapproval' && init?.method === 'POST') {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const created = { id: `pre-${preapprovals.size + 1}`, status: 'pending', init_point: `https://mp.test/checkout/${preapprovals.size + 1}`, ...body };
    preapprovals.set(created.id, created);
    return new Response(JSON.stringify(created), { status: 201 });
  }
  const preapproval = /^\/preapproval\/(.+)$/.exec(pathname);
  if (preapproval) return new Response(JSON.stringify(preapprovals.get(preapproval[1]) ?? {}), { status: preapprovals.has(preapproval[1]) ? 200 : 404 });
  const payment = /^\/authorized_payments\/(.+)$/.exec(pathname);
  if (payment) return new Response(JSON.stringify(payments.get(payment[1]) ?? {}), { status: payments.has(payment[1]) ? 200 : 404 });
  return new Response('{}', { status: 404 });
});
const deps = { token: 'TEST-abc', fetchImpl };

beforeAll(() => {
  clinic = createProject({ name: 'Clínica', domain: 'clinica.test', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' }).id;
  saveSubscription(clinic, 'intermediario', 'teste');
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('billing with Mercado Pago', () => {
  it('creates a checkout link for the business plan and reuses it while pending', async () => {
    const link = await startCheckout({ projectId: clinic, payerEmail: 'Ana@Clinica.test', backUrl: 'https://nexo.test/dashboard/conta' }, deps);
    expect(link).toBe('https://mp.test/checkout/1');
    expect(getBilling(clinic)).toMatchObject({ subscriptionId: 'pre-1', mpStatus: 'pending', payerEmail: 'ana@clinica.test' });
    expect(preapprovals.get('pre-1')).toMatchObject({ external_reference: clinic, auto_recurring: { transaction_amount: 59 } });

    const again = await startCheckout({ projectId: clinic, payerEmail: 'ana@clinica.test', backUrl: 'https://nexo.test/dashboard/conta' }, deps);
    expect(again).toBe(link);
    expect(preapprovals.size).toBe(1);
  });

  it('activates the business when the subscription is authorized', async () => {
    preapprovals.set('pre-1', { ...preapprovals.get('pre-1'), status: 'authorized' });
    const result = await handleNotification('subscription_preapproval', 'pre-1', deps);
    expect(result).toMatchObject({ handled: true, projectId: clinic, outcome: 'ativo' });
    expect(getSubscription(clinic)?.status).toBe('ativo');
    expect(getBilling(clinic)?.mpStatus).toBe('authorized');
  });

  it('keeps a retried charge neutral and suspends when Mercado Pago gives up', async () => {
    payments.set('pay-1', { id: 'pay-1', preapproval_id: 'pre-1', status: 'recycling', payment: { status: 'rejected' } });
    expect((await handleNotification('subscription_authorized_payment', 'pay-1', deps)).outcome).toBeNull();
    expect(getSubscription(clinic)?.status).toBe('ativo');

    payments.set('pay-2', { id: 'pay-2', preapproval_id: 'pre-1', status: 'cancelled', payment: { status: 'rejected' } });
    expect((await handleNotification('subscription_authorized_payment', 'pay-2', deps)).outcome).toBe('suspenso');
    expect(getSubscription(clinic)?.status).toBe('suspenso');
  });

  it('reactivates on the next approved charge and keeps a history', async () => {
    payments.set('pay-3', { id: 'pay-3', preapproval_id: 'pre-1', status: 'processed', payment: { status: 'approved' } });
    await handleNotification('subscription_authorized_payment', 'pay-3', deps);
    expect(getSubscription(clinic)?.status).toBe('ativo');
    expect(listBillingEvents(clinic).length).toBeGreaterThanOrEqual(4);
  });

  it('refuses a new checkout while a subscription is active', async () => {
    await expect(startCheckout({ projectId: clinic, payerEmail: 'ana@clinica.test', backUrl: 'https://nexo.test' }, deps)).rejects.toThrow('já tem uma assinatura ativa');
  });

  it('ignores notifications for unknown subscriptions and other topics', async () => {
    preapprovals.set('pre-x', { id: 'pre-x', status: 'authorized', external_reference: 'nao-existe' });
    expect((await handleNotification('subscription_preapproval', 'pre-x', deps)).handled).toBe(false);
    expect((await handleNotification('merchant_order', '1', deps)).handled).toBe(false);
  });
});
