'use server';

import { runWithCurrentProject, createProject } from '@/lib/db';
import { forgetUser, linkUserToProject, requireAdmin, unlinkUserFromProject } from '@/lib/access';
import { adminApi, listAccounts, MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const text = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
};

function done(message: string, kind: 'ok' | 'erro' = 'ok'): never {
  revalidatePath('/dashboard/usuarios');
  redirect(`/dashboard/usuarios?${kind}=${encodeURIComponent(message)}`);
}

function failure(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (/already exists|USER_ALREADY_EXISTS/i.test(message)) return 'Já existe uma conta com este e-mail.';
  return message && !/^NEXT_/.test(message) ? message : fallback;
}

/** Creates a subscriber (or admin) account, optionally with a new business linked to it. */
export async function createAccountAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireAdmin();
    const name = text(formData, 'name');
    const email = text(formData, 'email').toLowerCase();
    const password = text(formData, 'password');
    const role = text(formData, 'role') === 'admin' ? 'admin' : 'user';
    if (!name || !email) done('Informe o nome e o e-mail.', 'erro');
    if (password.length < MIN_PASSWORD_LENGTH) done(`A senha inicial precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`, 'erro');

    let userId: string;
    try {
      const created = await (await adminApi()).createUser({ body: { name, email, password, role }, headers: await headers() });
      userId = created.user.id;
    } catch (error) {
      done(failure(error, 'Não foi possível criar a conta.'), 'erro');
    }

    const existing = text(formData, 'project_id');
    const businessName = text(formData, 'business_name');
    const businessDomain = text(formData, 'business_domain');
    try {
      if (businessName && businessDomain) {
        const project = createProject({ name: businessName, domain: businessDomain, defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' });
        linkUserToProject(userId, project.id);
      } else if (existing) {
        linkUserToProject(userId, existing);
      }
    } catch (error) {
      done(`Conta criada, mas o negócio não: ${failure(error, 'erro ao cadastrar o negócio')}.`, 'erro');
    }
    done(`Conta de ${email} criada.`);
  });
}

export async function linkProjectAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireAdmin();
    const userId = text(formData, 'user_id');
    const projectId = text(formData, 'project_id');
    if (userId && projectId) linkUserToProject(userId, projectId);
    done('Negócio ligado à conta.');
  });
}

export async function unlinkProjectAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireAdmin();
    unlinkUserFromProject(text(formData, 'user_id'), text(formData, 'project_id'));
    done('Negócio desligado da conta.');
  });
}

export async function setPasswordAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireAdmin();
    const password = text(formData, 'password');
    if (password.length < MIN_PASSWORD_LENGTH) done(`A nova senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`, 'erro');
    try {
      await (await adminApi()).setUserPassword({ body: { userId: text(formData, 'user_id'), newPassword: password }, headers: await headers() });
    } catch (error) {
      done(failure(error, 'Não foi possível trocar a senha.'), 'erro');
    }
    done('Senha redefinida. Passe a nova senha ao cliente por um canal seguro.');
  });
}

export async function setBlockedAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const admin = await requireAdmin();
    const userId = text(formData, 'user_id');
    if (userId === admin.id) done('Você não pode bloquear a própria conta.', 'erro');
    try {
      const api = await adminApi();
      if (text(formData, 'blocked') === 'true') await api.banUser({ body: { userId, banReason: 'Bloqueado pela equipe do Nexo' }, headers: await headers() });
      else await api.unbanUser({ body: { userId }, headers: await headers() });
    } catch (error) {
      done(failure(error, 'Não foi possível alterar o bloqueio.'), 'erro');
    }
    done(text(formData, 'blocked') === 'true' ? 'Conta bloqueada. A pessoa sai na próxima ação.' : 'Conta desbloqueada.');
  });
}

export async function deleteAccountAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const admin = await requireAdmin();
    const userId = text(formData, 'user_id');
    if (userId === admin.id) done('Você não pode excluir a própria conta.', 'erro');
    const accounts = await listAccounts();
    const target = accounts.find((account) => account.id === userId);
    if (target?.role.includes('admin') && accounts.filter((account) => account.role.includes('admin')).length <= 1) {
      done('Mantenha pelo menos um administrador.', 'erro');
    }
    try {
      await (await adminApi()).removeUser({ body: { userId }, headers: await headers() });
      forgetUser(userId);
    } catch (error) {
      done(failure(error, 'Não foi possível excluir a conta.'), 'erro');
    }
    done('Conta excluída. Os negócios e os dados dela continuam na plataforma.');
  });
}
