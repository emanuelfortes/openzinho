'use server';

import { revalidatePath } from 'next/cache';
import { runWithCurrentProject } from '@/lib/db';
import { hidePesquisa } from '@/modules/palavras/palavras-db';
import { executeResearch, prepareEstimate, type EstimateResponse, type RawResearchForm } from '@/modules/palavras/service';

/** Step 1: no provider call, only the advisory estimate, the caps and a reusable saved research. */
export async function estimarPesquisaAction(form: RawResearchForm): Promise<EstimateResponse | { error: string }> {
  return runWithCurrentProject(async () => prepareEstimate(form));
}

/** Step 2: paid. Requires the estimate the user confirmed by clicking. */
export async function executarPesquisaAction(form: RawResearchForm, confirmedUsd: number): Promise<{ id: string } | { error: string }> {
  return runWithCurrentProject(async () => {
    const result = await executeResearch(form, confirmedUsd);
    if ('id' in result) revalidatePath('/dashboard/sugestao-de-palavras');
    return result;
  });
}

export async function ocultarPesquisaAction(formData: FormData): Promise<void> {
  return runWithCurrentProject(async () => {
    const id = formData.get('id');
    if (typeof id === 'string' && id) hidePesquisa(id);
    revalidatePath('/dashboard/sugestao-de-palavras');
  });
}
