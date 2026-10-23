'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { canOpenProject, requireAdmin, requireUser } from '@/lib/access';
import { publicBaseUrl } from '@/modules/relatorio/share-tokens';
import { startCheckout } from './billing';
import { MercadoPagoError, mercadoPagoConfigured } from './mercadopago';

/** Where Mercado Pago sends the customer back: NEXO_PUBLIC_URL, else this request's address. */
async function appBase(): Promise<string> {
  const configured = publicBaseUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}

const message = (error: unknown) => (error instanceof MercadoPagoError || error instanceof Error ? error.message : 'Não foi possível gerar o pagamento.');

/** A subscriber pays for one of their businesses: redirects to the Mercado Pago checkout. */
export async function startCheckoutAction(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get('project_id') ?? '');
  const back = String(formData.get('back') ?? '/dashboard/conta') === '/assinatura-suspensa' ? '/assinatura-suspensa' : '/dashboard/conta';
  if (!mercadoPagoConfigured()) redirect(`${back}?erro=${encodeURIComponent('O pagamento online ainda não está disponível. Fale com o suporte do Nexo.')}`);
  if (!canOpenProject(user, projectId)) redirect(`${back}?erro=${encodeURIComponent('Você não tem acesso a este negócio.')}`);
  let link: string;
  try {
    link = await startCheckout({ projectId, payerEmail: user.email, backUrl: `${await appBase()}/dashboard/conta?pagamento=retorno` });
  } catch (error) {
    redirect(`${back}?erro=${encodeURIComponent(message(error))}`);
  }
  redirect(link);
}

function failAdmin(text: string): never {
  redirect(`/dashboard/assinaturas?erro=${encodeURIComponent(text)}`);
}

/** The team creates a payment link for a business, to send to the customer by e-mail or WhatsApp. */
export async function adminPaymentLinkAction(formData: FormData) {
  await requireAdmin();
  const projectId = String(formData.get('project_id') ?? '');
  const email = String(formData.get('payer_email') ?? '').trim().toLowerCase();
  if (!mercadoPagoConfigured()) failAdmin('Configure MERCADOPAGO_ACCESS_TOKEN para gerar links de pagamento.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) failAdmin('Informe o e-mail de quem vai pagar.');
  let link: string;
  try {
    link = await startCheckout({ projectId, payerEmail: email, backUrl: `${await appBase()}/dashboard/conta?pagamento=retorno` });
  } catch (error) {
    failAdmin(message(error));
  }
  revalidatePath('/dashboard/assinaturas');
  redirect(`/dashboard/assinaturas?link=${encodeURIComponent(link)}&ok=${encodeURIComponent(`Link de pagamento criado para ${email}.`)}`);
}
