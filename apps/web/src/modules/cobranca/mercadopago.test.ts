import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import { PLANS } from '@/modules/planos/plans';
import {
  createSubscription, mercadoPagoConfigured, mercadoPagoTestMode, outcomeOfCharge, outcomeOfSubscription, verifyNotificationSignature,
} from './mercadopago';

const SECRET = 'segredo-do-webhook';
const sign = (manifest: string) => createHmac('sha256', SECRET).update(manifest).digest('hex');

describe('verifyNotificationSignature', () => {
  it('accepts the signature Mercado Pago computes over id, request id and timestamp', () => {
    const v1 = sign('id:abc123;request-id:req-1;ts:1704908010;');
    expect(verifyNotificationSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: 'req-1', dataId: 'ABC123', secret: SECRET })).toBe(true);
  });

  it('refuses a wrong secret, a changed id or a missing header', () => {
    const v1 = sign('id:abc123;request-id:req-1;ts:1704908010;');
    expect(verifyNotificationSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: 'req-1', dataId: 'abc124', secret: SECRET })).toBe(false);
    expect(verifyNotificationSignature({ signature: `ts=1704908010,v1=${v1}`, requestId: 'req-1', dataId: 'abc123', secret: 'outro' })).toBe(false);
    expect(verifyNotificationSignature({ signature: null, requestId: 'req-1', dataId: 'abc123', secret: SECRET })).toBe(false);
    expect(verifyNotificationSignature({ signature: 'ts=1', requestId: 'req-1', dataId: 'abc123', secret: SECRET })).toBe(false);
  });

  it('leaves out the parts Mercado Pago did not send', () => {
    const v1 = sign('id:999;ts:5;');
    expect(verifyNotificationSignature({ signature: `ts=5,v1=${v1}`, requestId: null, dataId: '999', secret: SECRET })).toBe(true);
  });
});

describe('outcomes', () => {
  it('maps subscription statuses to the business status', () => {
    expect(outcomeOfSubscription('authorized')).toBe('ativo');
    expect(outcomeOfSubscription('paused')).toBe('suspenso');
    expect(outcomeOfSubscription('cancelled')).toBe('suspenso');
    expect(outcomeOfSubscription('canceled')).toBe('suspenso');
    expect(outcomeOfSubscription('pending')).toBe('pendente');
    expect(outcomeOfSubscription('whatever')).toBeNull();
  });

  it('keeps retried charges neutral and suspends only when Mercado Pago gives up', () => {
    expect(outcomeOfCharge({ id: 1, status: 'processed', payment: { status: 'approved' } })).toBe('ativo');
    expect(outcomeOfCharge({ id: 1, status: 'recycling', payment: { status: 'rejected' } })).toBeNull();
    expect(outcomeOfCharge({ id: 1, status: 'cancelled', payment: { status: 'rejected' } })).toBe('suspenso');
  });
});

describe('configuration', () => {
  it('is off without a token and knows the test environment', () => {
    expect(mercadoPagoConfigured({})).toBe(false);
    expect(mercadoPagoTestMode({ MERCADOPAGO_ACCESS_TOKEN: 'TEST-123' })).toBe(true);
    expect(mercadoPagoTestMode({ MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-123' })).toBe(false);
  });
});

describe('createSubscription', () => {
  it('posts a pending monthly subscription in reais tied to the business', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: 'pre-1', status: 'pending', init_point: 'https://mp.test/checkout/pre-1' }), { status: 201 }));
    const result = await createSubscription(
      { projectId: 'proj-1', businessName: 'Clínica Sorriso', plan: PLANS.completo, payerEmail: 'ana@clinica.test', backUrl: 'https://nexo.test/dashboard/conta' },
      { token: 'TEST-abc', fetchImpl },
    );
    expect(result.init_point).toBe('https://mp.test/checkout/pre-1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mercadopago.com/preapproval');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TEST-abc');
    expect(JSON.parse(String(init.body))).toMatchObject({
      external_reference: 'proj-1', payer_email: 'ana@clinica.test', status: 'pending', reason: 'Nexo Completo · Clínica Sorriso',
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 79, currency_id: 'BRL' },
    });
  });

  it('reports a refusal from Mercado Pago in Portuguese', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ message: 'invalid payer_email' }), { status: 400 }));
    await expect(createSubscription(
      { projectId: 'p', businessName: 'X', plan: PLANS.basico, payerEmail: 'x', backUrl: 'https://nexo.test' }, { token: 'TEST-abc', fetchImpl },
    )).rejects.toThrow('O Mercado Pago recusou o pedido (400: invalid payer_email).');
  });
});
