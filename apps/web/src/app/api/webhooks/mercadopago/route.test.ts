import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-mp-webhook-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, createProject } from '@/lib/db';
import { getSubscription, saveSubscription } from '@/modules/planos/plans-db';
import { POST } from './route';

const SECRET = 'segredo';
let clinic: string;

function notification(dataId: string, options: { secret?: string; ts?: string } = {}) {
  const ts = options.ts ?? '1704908010';
  const v1 = createHmac('sha256', options.secret ?? SECRET).update(`id:${dataId};request-id:req-9;ts:${ts};`).digest('hex');
  return new NextRequest(`https://nexo.test/api/webhooks/mercadopago?data.id=${dataId}&type=subscription_preapproval`, {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-9', 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'subscription_preapproval', data: { id: dataId } }),
  });
}

beforeAll(() => {
  clinic = createProject({ name: 'Clínica', domain: 'clinica.test', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' }).id;
  saveSubscription(clinic, 'basico', 'suspenso');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /api/webhooks/mercadopago', () => {
  it('is off without a Mercado Pago token', async () => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '');
    expect((await POST(notification('pre1'))).status).toBe(503);
  });

  it('refuses a notification with a wrong signature', async () => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-abc');
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', SECRET);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await POST(notification('pre1', { secret: 'outro' }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-reads a signed notification from Mercado Pago and reactivates the business', async () => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-abc');
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', SECRET);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'pre1', status: 'authorized', external_reference: clinic, payer_email: 'ana@clinica.test', init_point: 'https://mp.test/c',
    }), { status: 200 })));
    const response = await POST(notification('pre1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, handled: true, outcome: 'ativo' });
    expect(getSubscription(clinic)?.status).toBe('ativo');
  });

  it('asks Mercado Pago to retry when its API is down', async () => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TEST-abc');
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', SECRET);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await POST(notification('pre1'))).status).toBe(500);
  });
});
