'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { runWithCurrentProject } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { getAuth, MIN_PASSWORD_LENGTH } from '@/lib/auth';

function back(kind: 'ok' | 'erro', message: string): never {
  redirect(`/dashboard/conta?${kind}=${encodeURIComponent(message)}`);
}

export async function changePasswordAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireUser();
    const current = String(formData.get('current') ?? '');
    const next = String(formData.get('next') ?? '');
    if (next.length < MIN_PASSWORD_LENGTH) back('erro', `A nova senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    if (next !== String(formData.get('confirm') ?? '')) back('erro', 'A confirmação não é igual à nova senha.');
    try {
      // Signs out the other devices; this browser keeps its session.
      await (await getAuth()).api.changePassword({ body: { currentPassword: current, newPassword: next, revokeOtherSessions: true }, headers: await headers() });
    } catch {
      back('erro', 'A senha atual não confere.');
    }
    back('ok', 'Senha trocada. Os outros aparelhos foram desconectados.');
  });
}
