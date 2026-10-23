import { withProjectScope, getProjects } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { membersByProject, requireAdmin } from '@/lib/access';
import { authEnabled } from '@/lib/auth-config';
import { listAccounts } from '@/lib/auth';
import { formatBrl } from '@/modules/custos/budget-shared';
import { describePlan, listSubscriptions, PLAN_ORDER, PLANS, STATUS_LABEL, type PlanStatus } from '@/modules/planos/plans-db';
import { removeSubscriptionAction, saveSubscriptionAction } from './actions';
import { listBilling, listBillingEvents } from '@/modules/cobranca/billing';
import { mercadoPagoConfigured, mercadoPagoTestMode, subscriptionStatusLabel } from '@/modules/cobranca/mercadopago';
import { adminPaymentLinkAction } from '@/modules/cobranca/actions';

const fieldCls = 'nexo-input min-w-0 w-full px-2.5 py-1.5 text-xs outline-none focus:border-nexo-sky';

const STATUS_TONE: Record<PlanStatus, string> = {
  ativo: 'text-nexo-ice',
  teste: 'text-nexo-sky',
  suspenso: 'text-nexo-danger-text',
};

async function AssinaturasPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; link?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const projects = getProjects();
  const subscriptions = listSubscriptions();
  const billingOn = mercadoPagoConfigured();
  const billing = listBilling();
  const members = membersByProject();
  const emailById = new Map(authEnabled() ? (await listAccounts()).map((account) => [account.id, account.email]) : []);

  const active = [...subscriptions.values()].filter((subscription) => subscription.status === 'ativo');
  const monthlyRevenue = active.reduce((sum, subscription) => sum + PLANS[subscription.plan].priceBrl, 0);
  const count = (status: PlanStatus) => [...subscriptions.values()].filter((subscription) => subscription.status === status).length;
  const withoutPlan = projects.filter((project) => !subscriptions.has(project.id)).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Assinaturas</h1>
        <p className="mt-2 max-w-2xl text-sm text-nexo-dim">
          O plano de cada negócio define o que o cliente pode usar: tamanho da grade, palavras-chave, frequência e IA. Assinatura suspensa pausa as varreduras automáticas e mostra um aviso ao cliente. Administradores não têm limites.
        </p>
      </div>

      {params.ok && <p role="status" className="rounded-nexo-lg border border-nexo-ice/30 bg-nexo-ice/10 px-4 py-3 text-sm text-nexo-ice">{params.ok}</p>}
      {params.link && (
        <div className="nexo-panel p-4 text-sm">
          <p className="nexo-section">Link de pagamento</p>
          <p className="mt-2 break-all font-mono text-xs text-nexo-ice">{params.link}</p>
          <p className="mt-2 text-xs text-nexo-faint">Envie ao cliente por e-mail ou WhatsApp. Quando ele pagar, a assinatura fica ativa sozinha.</p>
        </div>
      )}
      {!billingOn && (
        <p className="rounded-nexo-lg border border-nexo-border bg-nexo-surface-2 px-4 py-3 text-xs text-nexo-dim">
          Cobrança pelo Mercado Pago desligada. Para ligar, coloque <code>MERCADOPAGO_ACCESS_TOKEN</code> (e <code>MERCADOPAGO_WEBHOOK_SECRET</code>) no <code>.env</code> e cadastre o endereço <code>/api/webhooks/mercadopago</code> nas notificações do Mercado Pago. Veja <code>docs/COBRANCA-MERCADOPAGO.md</code>.
        </p>
      )}
      {billingOn && mercadoPagoTestMode() && <p className="text-xs text-nexo-warn-text">Mercado Pago em ambiente de teste (token TEST-): nenhum pagamento é cobrado de verdade.</p>}
      {params.erro && <p role="alert" className="rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-4 py-3 text-sm text-nexo-danger-text">{params.erro}</p>}

      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        <div className="nexo-panel p-4"><p className="nexo-label">Receita mensal</p><p className="nexo-metric mt-1 font-mono text-2xl">{formatBrl(monthlyRevenue)}</p><p className="text-xs text-nexo-faint">assinaturas ativas, pelo preço de tabela</p></div>
        <div className="nexo-panel p-4"><p className="nexo-label">Ativas</p><p className="nexo-metric mt-1 font-mono text-2xl">{count('ativo')}</p></div>
        <div className="nexo-panel p-4"><p className="nexo-label">Em teste</p><p className="nexo-metric mt-1 font-mono text-2xl">{count('teste')}</p></div>
        <div className="nexo-panel p-4"><p className="nexo-label">Suspensas</p><p className="nexo-metric mt-1 font-mono text-2xl">{count('suspenso')}</p></div>
        <div className="nexo-panel p-4"><p className="nexo-label">Sem plano</p><p className="nexo-metric mt-1 font-mono text-2xl">{withoutPlan}</p><p className="text-xs text-nexo-faint">clientes nelas usam os limites do Básico</p></div>
      </div>

      <section className="nexo-panel p-4 text-xs text-nexo-dim">
        <p className="nexo-section mb-2">Planos</p>
        <ul className="grid gap-1.5">
          {PLAN_ORDER.map((id) => (
            <li key={id}><b className="font-medium text-nexo-text">{PLANS[id].name}</b> · {formatBrl(PLANS[id].priceBrl)}/mês · {describePlan(PLANS[id])} · teto padrão de gasto {formatBrl(PLANS[id].capBrl)}</li>
          ))}
        </ul>
      </section>

      <section className="nexo-panel overflow-x-auto p-4">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead>
            <tr className="border-b border-nexo-border">
              <th className="py-2 pr-3">Negócio</th>
              <th className="py-2 pr-3">Clientes</th>
              <th className="py-2 pr-3">Plano · situação · nota</th>
              {billingOn && <th className="py-2 pr-3">Pagamento</th>}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const subscription = subscriptions.get(project.id);
              const clients = (members.get(project.id) ?? []).map((id) => emailById.get(id)).filter(Boolean);
              return (
                <tr key={project.id} className="border-b border-nexo-border align-top last:border-0">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-nexo-text">{project.name}</p>
                    <p className="text-nexo-faint">{project.domain}</p>
                    <p className={`mt-1 ${subscription ? STATUS_TONE[subscription.status] : 'text-nexo-faint'}`}>
                      {subscription ? `${PLANS[subscription.plan].name} · ${STATUS_LABEL[subscription.status]}` : 'Sem plano'}
                    </p>
                  </td>
                  <td className="py-3 pr-3 text-nexo-dim">{clients.length ? clients.join(', ') : <span className="text-nexo-faint">Nenhum cliente ligado</span>}</td>
                  <td className="py-3 pr-3">
                    <form action={saveSubscriptionAction} className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
                      <input type="hidden" name="project_id" value={project.id} />
                      <select name="plan" defaultValue={subscription?.plan ?? 'basico'} className={fieldCls} aria-label={`Plano de ${project.name}`}>
                        {PLAN_ORDER.map((id) => <option key={id} value={id}>{PLANS[id].name} · {formatBrl(PLANS[id].priceBrl)}</option>)}
                      </select>
                      <select name="status" defaultValue={subscription?.status ?? 'ativo'} className={fieldCls} aria-label={`Situação de ${project.name}`}>
                        {(['ativo', 'teste', 'suspenso'] as const).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                      </select>
                      <input name="note" defaultValue={subscription?.note ?? ''} placeholder="Nota (opcional)" className={fieldCls} />
                      <button type="submit" className="nexo-section justify-self-start hover:text-white">Salvar</button>
                    </form>
                  </td>
                  {billingOn && (
                    <td className="py-3 pr-3">
                      {(() => {
                        const current = billing.get(project.id);
                        const events = listBillingEvents(project.id, 3);
                        return (
                          <div className="grid gap-2">
                            <p className={current?.mpStatus === 'authorized' ? 'text-nexo-ice' : 'text-nexo-dim'}>{subscriptionStatusLabel(current?.mpStatus)}</p>
                            {current?.payerEmail && <p className="text-nexo-faint">{current.payerEmail}</p>}
                            {current?.mpStatus !== 'authorized' && (
                              <form action={adminPaymentLinkAction} className="flex gap-2">
                                <input type="hidden" name="project_id" value={project.id} />
                                <input name="payer_email" type="email" required defaultValue={current?.payerEmail || clients[0] || ''} placeholder="E-mail de quem paga" className={`${fieldCls} max-w-48`} />
                                <button type="submit" className="nexo-section shrink-0 hover:text-white">Gerar link</button>
                              </form>
                            )}
                            {events.map((event) => (
                              <p key={`${event.at}-${event.kind}`} className="text-[11px] text-nexo-faint">
                                {new Date(event.at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}: {event.detail}
                              </p>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                  )}
                  <td className="py-3 text-right">
                    {subscription && (
                      <form action={removeSubscriptionAction}>
                        <input type="hidden" name="project_id" value={project.id} />
                        <button type="submit" className="nexo-label hover:text-nexo-danger-text">Remover plano</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-nexo-faint">Com o Mercado Pago ligado, a situação muda sozinha: pagamento autorizado ativa a assinatura, e assinatura pausada, cancelada ou com cobrança recusada depois das novas tentativas suspende. Também dá para mudar à mão aqui.</p>
    </div>
  );
}

export default withProjectScope(AssinaturasPage);
