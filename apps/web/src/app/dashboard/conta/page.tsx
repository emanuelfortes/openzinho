import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { allowedProjects, requireUser } from '@/lib/access';
import { authEnabled } from '@/lib/auth-config';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { describePlan, getSubscription, PLANS, STATUS_LABEL, DEFAULT_PLAN } from '@/modules/planos/plans-db';
import { formatBrl } from '@/modules/custos/budget-shared';
import { changePasswordAction } from './actions';

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2.5 text-sm outline-none focus:border-nexo-sky';

async function ContaPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const businesses = allowedProjects(user);

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="nexo-h1">Minha conta</h1>

      <section className="nexo-panel grid gap-3 p-5 text-sm sm:grid-cols-2">
        <div><p className="nexo-label">Nome</p><p className="mt-1 text-nexo-text">{user.name || '—'}</p></div>
        <div><p className="nexo-label">E-mail</p><p className="mt-1 text-nexo-text">{user.email || 'Uso local, sem login'}</p></div>
        <div><p className="nexo-label">Acesso</p><p className="mt-1 text-nexo-text">{user.role === 'admin' ? 'Administrador do Nexo' : 'Cliente'}</p></div>
        <div>
          <p className="nexo-label">{user.role === 'admin' ? 'Negócios na plataforma' : 'Seus negócios'}</p>
          <p className="mt-1 text-nexo-text">{businesses.map((project) => project.name).join(', ') || 'Nenhum'}</p>
        </div>
      </section>

      {user.role === 'cliente' && businesses.length > 0 && (
        <section className="nexo-panel p-5">
          <p className="nexo-section">Assinatura</p>
          <ul className="mt-3 grid gap-3 text-sm">
            {businesses.map((project) => {
              const subscription = getSubscription(project.id);
              const plan = PLANS[subscription?.plan ?? DEFAULT_PLAN];
              return (
                <li key={project.id}>
                  <p className="text-nexo-text">{project.name}: plano <b className="font-medium">{plan.name}</b> · {formatBrl(plan.priceBrl)}/mês · {subscription ? STATUS_LABEL[subscription.status] : 'Em configuração'}</p>
                  <p className="text-xs text-nexo-faint">Inclui {describePlan(plan)}. Para mudar de plano, fale com o suporte do Nexo.</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {authEnabled() && (
        <section className="nexo-panel p-5">
          <p className="nexo-section">Trocar a senha</p>
          {params.ok && <p role="status" className="mt-3 rounded-nexo-lg border border-nexo-ice/30 bg-nexo-ice/10 px-3 py-2 text-sm text-nexo-ice">{params.ok}</p>}
          {params.erro && <p role="alert" className="mt-3 rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-3 py-2 text-sm text-nexo-danger-text">{params.erro}</p>}
          <form action={changePasswordAction} className="mt-4 grid gap-3">
            <label className="space-y-1"><span className="nexo-label block">Senha atual</span><input name="current" type="password" required autoComplete="current-password" className={fieldCls} /></label>
            <label className="space-y-1"><span className="nexo-label block">Nova senha</span><input name="next" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={fieldCls} /></label>
            <label className="space-y-1"><span className="nexo-label block">Confirme a nova senha</span><input name="confirm" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" className={fieldCls} /></label>
            <p className="text-xs text-nexo-faint">Pelo menos {MIN_PASSWORD_LENGTH} caracteres.</p>
            <div><button type="submit" className="nexo-btn-primary px-4 py-2.5">Trocar senha</button></div>
          </form>
        </section>
      )}
    </div>
  );
}

export default withProjectScope(ContaPage);
