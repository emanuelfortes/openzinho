import { redirect } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import SignOutButton from '@/components/SignOutButton';
import { requestUser, resolveProjectForUser, subscriberLockedOut } from '@/lib/access';
import { mercadoPagoConfigured } from '@/modules/cobranca/mercadopago';
import { startCheckoutAction } from '@/modules/cobranca/actions';

export const dynamic = 'force-dynamic';

/** The subscription of the active business is suspended (usually a payment problem). */
export default async function AssinaturaSuspensaPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const user = await requestUser();
  if (!user) redirect('/login');
  const project = resolveProjectForUser(user);
  if (!project || !subscriberLockedOut(user, project.id)) redirect('/dashboard');

  return (
    <AuthShell title="Assinatura suspensa" subtitle={`O acesso de ${project.name} está pausado.`}>
      <div className="grid gap-4 text-sm text-nexo-dim">
        <p>
          Isso costuma acontecer quando um pagamento não foi confirmado. Os seus dados, campanhas e relatórios continuam guardados;
          as varreduras automáticas ficam pausadas até a assinatura voltar.
        </p>
        {mercadoPagoConfigured() ? (
          <form action={startCheckoutAction}>
            <input type="hidden" name="project_id" value={project.id} />
            <input type="hidden" name="back" value="/assinatura-suspensa" />
            <button type="submit" className="nexo-btn-primary w-full px-4 py-2.5">Regularizar no Mercado Pago</button>
          </form>
        ) : (
          <p>Fale com o suporte do Nexo para regularizar e o painel abre de novo na hora.</p>
        )}
        {erro && <p role="alert" className="text-nexo-danger-text">{erro}</p>}
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
