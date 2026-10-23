import { redirect } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import SignOutButton from '@/components/SignOutButton';
import { requestUser, resolveProjectForUser, subscriberLockedOut } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** The subscription of the active business is suspended (usually a payment problem). */
export default async function AssinaturaSuspensaPage() {
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
        <p>Fale com o suporte do Nexo para regularizar e o painel abre de novo na hora.</p>
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
