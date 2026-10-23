import { withProjectScope, getProjects } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { membersByProject, requireAdmin } from '@/lib/access';
import { authEnabled } from '@/lib/auth-config';
import { listAccounts } from '@/lib/auth';
import { formatBrl } from '@/modules/custos/budget-shared';
import { describePlan, listSubscriptions, PLAN_ORDER, PLANS, STATUS_LABEL, type PlanStatus } from '@/modules/planos/plans-db';
import { removeSubscriptionAction, saveSubscriptionAction } from './actions';

const fieldCls = 'nexo-input min-w-0 w-full px-2.5 py-1.5 text-xs outline-none focus:border-nexo-sky';

const STATUS_TONE: Record<PlanStatus, string> = {
  ativo: 'text-nexo-ice',
  teste: 'text-nexo-sky',
  suspenso: 'text-nexo-danger-text',
};

async function AssinaturasPage({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const projects = getProjects();
  const subscriptions = listSubscriptions();
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
      <p className="text-xs text-nexo-faint">A cobrança automática (Pix, boleto e cartão) entra numa próxima etapa; até lá, a situação de cada assinatura é atualizada aqui.</p>
    </div>
  );
}

export default withProjectScope(AssinaturasPage);
