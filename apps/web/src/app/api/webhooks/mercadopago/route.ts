import { NextRequest, NextResponse } from 'next/server';
import { handleNotification } from '@/modules/cobranca/billing';
import { mercadoPagoConfigured, verifyNotificationSignature } from '@/modules/cobranca/mercadopago';

export const dynamic = 'force-dynamic';

/**
 * Mercado Pago notifications (public: see middleware). A notification only says that something
 * changed; the current state is always re-read from the Mercado Pago API, so a forged call cannot
 * activate anything. With MERCADOPAGO_WEBHOOK_SECRET set, the x-signature header is checked too.
 * Mercado Pago retries until it gets 200/201, so transient failures answer 500.
 */
export async function POST(request: NextRequest) {
  if (!mercadoPagoConfigured()) return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 503 });

  const url = request.nextUrl;
  const body = await request.json().catch(() => ({})) as { type?: string; topic?: string; action?: string; data?: { id?: string | number } };
  const type = url.searchParams.get('type') ?? url.searchParams.get('topic') ?? body.type ?? body.topic ?? '';
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? (body.data?.id != null ? String(body.data.id) : '');
  if (!type || !dataId) return NextResponse.json({ ok: true, ignored: 'sem tipo ou id' });

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (secret) {
    const valid = verifyNotificationSignature({
      signature: request.headers.get('x-signature'), requestId: request.headers.get('x-request-id'), dataId, secret,
    });
    if (!valid) return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  try {
    const result = await handleNotification(type, dataId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[mercadopago] notificação não processada:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Falha temporária' }, { status: 500 });
  }
}
