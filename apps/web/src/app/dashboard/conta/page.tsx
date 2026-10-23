import { withProjectScope } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { allowedProjects, requireUser } from '@/lib/access';
import { authEnabled } from '@/lib/auth-config';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { describePlan, getSubscription, PLANS, STATUS_LABEL, DEFAULT_PLAN } from '@/modules/planos/plans-db';
import { formatBrl } from '@/modules/custos/budget-shared';
import { getBilling } from '@/modules/cobranca/billing';
import { mercadoPagoConfigured, mercadoPagoTestMode, subscriptionStatusLabel } from '@/modules/cobranca/mercadopago';
import { startCheckoutAction } from '@/modules/cobranca/actions';
import { changePasswordAction } from './actions';

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2.5 text-sm outline-none focus:border-nexo-sky';

async function ContaPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; pagamento?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const businesses = allowedProjects(user);
  const billingOn = mercadoPagoConfigured();

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
                  {billingOn && (() => {
                    const billing = getBilling(project.id);
                    const paid = billing?.mpStatus === 'authorized';
                    return (
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <span className={`text-xs ${paid ? 'text-nexo-ice' : 'text-nexo-dim'}`}>{subscriptionStatusLabel(billing?.mpStatus)}</span>
                        {!paid && (
                          <form action={startCheckoutAction}>
                            <input type="hidden" name="project_id" value={project.id} />
                            <button type="submit" className="nexo-btn-accent px-3 py-2">{billing ? 'Concluir pagamento' : 'Assinar com Mercado Pago'}</button>
                          </form>
                        )}
                      </div>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
          {params.pagamento === 'retorno' && <p role="status" className="mt-3 rounded-nexo-lg border border-nexo-ice/30 bg-nexo-ice/10 px-3 py-2 text-xs text-nexo-ice">Você voltou do Mercado Pago. A confirmação do pagamento chega em alguns instantes e a assinatura é atualizada sozinha.</p>}
          {billingOn && <p className="mt-3 text-xs text-nexo-faint">O pagamento é feito na página do Mercado Pago, com cobrança automática todo mês no cartão. O Nexo não guarda os dados do seu cartão.{mercadoPagoTestMode() ? ' (Ambiente de teste: nada é cobrado.)' : ''}</p>}
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
