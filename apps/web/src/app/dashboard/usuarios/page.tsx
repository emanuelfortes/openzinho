import { withProjectScope, getProjects } from '@/lib/db';
export const dynamic = 'force-dynamic';

import { platformRole } from '@/lib/access-policy';
import { membersByProject, requireAdmin } from '@/lib/access';
import { listAccounts, MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { authEnabled } from '@/lib/auth-config';
import {
  createAccountAction, deleteAccountAction, linkProjectAction, setBlockedAction, setPasswordAction, unlinkProjectAction,
} from './actions';
import ConfirmButton from './ConfirmButton';

type SearchParams = { ok?: string; erro?: string };

const fieldCls = 'nexo-input min-w-0 w-full px-3 py-2 text-sm outline-none focus:border-nexo-sky';

async function UsuariosPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const admin = await requireAdmin();
  const params = await searchParams;

  if (!authEnabled()) {
    return (
      <div className="space-y-4">
        <h1 className="nexo-h1">Usuários</h1>
        <p className="nexo-panel max-w-2xl p-6 text-sm text-nexo-dim">
          O login está desligado nesta instalação (uso local de uma pessoa só). Para criar contas de clientes, ligue o login com <code>AUTH_ENABLED=true</code>, como já vem no <code>docker-compose.nexo.yml</code>.
        </p>
      </div>
    );
  }

  const accounts = await listAccounts();
  const projects = getProjects();
  const members = membersByProject();
  const projectsOf = (userId: string) => projects.filter((project) => (members.get(project.id) ?? []).includes(userId));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="nexo-h1">Usuários</h1>
        <p className="mt-2 max-w-2xl text-sm text-nexo-dim">
          Cada cliente entra com a própria conta e vê só os negócios ligados a ela. Administradores veem todos os negócios e as ferramentas avançadas.
        </p>
      </div>

      {params.ok && <p role="status" className="rounded-nexo-lg border border-nexo-ice/30 bg-nexo-ice/10 px-4 py-3 text-sm text-nexo-ice">{params.ok}</p>}
      {params.erro && <p role="alert" className="rounded-nexo-lg border border-nexo-danger/40 bg-nexo-danger/10 px-4 py-3 text-sm text-nexo-danger-text">{params.erro}</p>}

      <section className="nexo-panel p-5">
        <p className="nexo-section">Nova conta</p>
        <form action={createAccountAction} className="mt-4 grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <label className="space-y-1"><span className="nexo-label block">Nome</span><input name="name" required className={fieldCls} /></label>
          <label className="space-y-1"><span className="nexo-label block">E-mail</span><input name="email" type="email" required className={fieldCls} /></label>
          <label className="space-y-1">
            <span className="nexo-label block">Senha inicial</span>
            <input name="password" type="text" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" placeholder={`Mínimo de ${MIN_PASSWORD_LENGTH} caracteres`} className={fieldCls} />
          </label>
          <label className="space-y-1">
            <span className="nexo-label block">Papel</span>
            <select name="role" defaultValue="user" className={fieldCls}>
              <option value="user">Cliente (dono do negócio)</option>
              <option value="admin">Administrador do Nexo</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="nexo-label block">Negócio existente</span>
            <select name="project_id" defaultValue="" className={fieldCls}>
              <option value="">Nenhum</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.domain}</option>)}
            </select>
          </label>
          <label className="space-y-1"><span className="nexo-label block">Ou novo negócio: nome</span><input name="business_name" placeholder="Clínica Sorriso" className={fieldCls} /></label>
          <label className="space-y-1"><span className="nexo-label block">Domínio do negócio</span><input name="business_domain" placeholder="clinicasorriso.com.br" className={fieldCls} /></label>
          <div className="flex items-end"><button type="submit" className="nexo-btn-primary px-4 py-2.5">Criar conta</button></div>
        </form>
        <p className="mt-3 text-xs text-nexo-faint">
          Combine com o cliente como passar a senha inicial e peça que ele a troque em “Minha conta”. Por enquanto as contas não recebem e-mail automático.
        </p>
      </section>

      <section className="nexo-panel overflow-x-auto p-4">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead>
            <tr className="border-b border-nexo-border">
              <th className="py-2 pr-3">Conta</th>
              <th className="py-2 pr-3">Papel</th>
              <th className="py-2 pr-3">Negócios</th>
              <th className="py-2 pr-3">Senha</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const role = platformRole(account.role);
              const linked = projectsOf(account.id);
              const unlinked = projects.filter((project) => !linked.some((item) => item.id === project.id));
              const self = account.id === admin.id;
              return (
                <tr key={account.id} className="border-b border-nexo-border align-top last:border-0">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-nexo-text">{account.name}{self ? ' (você)' : ''}</p>
                    <p className="text-nexo-dim">{account.email}</p>
                    {account.banned && <p className="mt-1 text-nexo-danger-text">Bloqueada</p>}
                  </td>
                  <td className="py-3 pr-3 text-nexo-dim">{role === 'admin' ? 'Administrador' : 'Cliente'}</td>
                  <td className="py-3 pr-3">
                    {role === 'admin' ? (
                      <span className="text-nexo-faint">Todos</span>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-1.5">
                          {linked.length === 0 && <span className="text-nexo-warn-text">Nenhum: a pessoa não consegue entrar no painel</span>}
                          {linked.map((project) => (
                            <form key={project.id} action={unlinkProjectAction} className="inline-flex items-center gap-1 rounded-[3px] border border-nexo-border-strong px-1.5 py-0.5">
                              <input type="hidden" name="user_id" value={account.id} />
                              <input type="hidden" name="project_id" value={project.id} />
                              <span className="text-nexo-sky">{project.name}</span>
                              <button type="submit" title="Desligar este negócio" aria-label={`Desligar ${project.name}`} className="text-nexo-faint hover:text-nexo-danger-text">×</button>
                            </form>
                          ))}
                        </div>
                        {unlinked.length > 0 && (
                          <form action={linkProjectAction} className="flex gap-2">
                            <input type="hidden" name="user_id" value={account.id} />
                            <select name="project_id" className={`${fieldCls} max-w-56 py-1.5 text-xs`}>
                              {unlinked.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                            </select>
                            <button type="submit" className="nexo-section shrink-0 hover:text-white">Ligar</button>
                          </form>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <form action={setPasswordAction} className="flex gap-2">
                      <input type="hidden" name="user_id" value={account.id} />
                      <input name="password" type="text" minLength={MIN_PASSWORD_LENGTH} required autoComplete="new-password" placeholder="Nova senha" className={`${fieldCls} max-w-40 py-1.5 text-xs`} />
                      <button type="submit" className="nexo-section shrink-0 hover:text-white">Redefinir</button>
                    </form>
                  </td>
                  <td className="py-3 text-right">
                    {!self && (
                      <div className="flex flex-col items-end gap-2">
                        <form action={setBlockedAction}>
                          <input type="hidden" name="user_id" value={account.id} />
                          <input type="hidden" name="blocked" value={account.banned ? 'false' : 'true'} />
                          <button type="submit" className="nexo-section hover:text-white">{account.banned ? 'Desbloquear' : 'Bloquear'}</button>
                        </form>
                        <ConfirmButton action={deleteAccountAction} userId={account.id} message={`Excluir a conta de ${account.email}? A pessoa perde o acesso; os negócios e os dados continuam.`} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default withProjectScope(UsuariosPage);
