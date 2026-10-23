import { redirect } from 'next/navigation';
import AuthShell from '@/components/AuthShell';
import SignOutButton from '@/components/SignOutButton';
import { allowedProjects, requestUser } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** Signed in, but no business is linked to the account yet. */
export default async function SemAcessoPage() {
  const user = await requestUser();
  if (!user) redirect('/login');
  if (allowedProjects(user).length > 0) redirect('/dashboard');

  return (
    <AuthShell title="Sua conta está quase pronta" subtitle="Ainda não há um negócio ligado a esta conta.">
      <div className="grid gap-4 text-sm text-nexo-dim">
        <p>
          A equipe do Nexo liga o seu negócio à conta {user.email ? <b className="font-medium text-nexo-text">{user.email}</b> : 'que você usou'} durante a configuração.
          Assim que isso for feito, o painel abre normalmente. Se demorar, fale com o suporte.
        </p>
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
