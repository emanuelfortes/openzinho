'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runWithCurrentProject, projectExists } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { deleteSubscription, parsePlanId, parsePlanStatus, saveSubscription } from '@/modules/planos/plans-db';

function back(kind: 'ok' | 'erro', message: string): never {
  revalidatePath('/dashboard/assinaturas');
  redirect(`/dashboard/assinaturas?${kind}=${encodeURIComponent(message)}`);
}

export async function saveSubscriptionAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireAdmin();
    const projectId = String(formData.get('project_id') ?? '');
    const plan = parsePlanId(String(formData.get('plan') ?? ''));
    const status = parsePlanStatus(String(formData.get('status') ?? ''));
    if (!projectExists(projectId)) back('erro', 'Negócio não encontrado.');
    if (!plan || !status) back('erro', 'Escolha o plano e a situação.');
    saveSubscription(projectId, plan, status, String(formData.get('note') ?? ''));
    back('ok', 'Assinatura salva.');
  });
}

export async function removeSubscriptionAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    await requireAdmin();
    deleteSubscription(String(formData.get('project_id') ?? ''));
    back('ok', 'Assinatura removida. O negócio volta a não ter plano.');
  });
}
