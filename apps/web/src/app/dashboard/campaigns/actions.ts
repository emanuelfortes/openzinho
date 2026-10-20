'use server';

import { runWithCurrentProject, type GridScheduleFrequency } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { deleteCampaign, runCampaignNow, saveCampaign, validateCampaign, type GridCampaignInput } from '@/modules/grade/campaigns-db';

function text(formData: FormData, key: string, fallback = ''): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : fallback;
}

function safeTimeZone(value: string): string {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return 'UTC';
  }
}

function campaignFromForm(formData: FormData): GridCampaignInput {
  return {
    name: text(formData, 'name'),
    target: text(formData, 'target'),
    center: text(formData, 'center'),
    grid_size: Number(text(formData, 'grid_size', '5')),
    spacing_km: Number(text(formData, 'spacing_km', '0.5')),
    language: text(formData, 'language', 'Portuguese'),
    queue_mode: text(formData, 'queue_mode') === 'priority' ? 'priority' : 'standard',
    frequency: text(formData, 'frequency', 'biweekly') as GridScheduleFrequency,
    weekday: Number(text(formData, 'weekday', '1')),
    month_day: Number(text(formData, 'month_day', '1')),
    time_of_day: text(formData, 'time_of_day', '03:00'),
    time_zone: safeTimeZone(text(formData, 'time_zone', 'UTC')),
    keywords: text(formData, 'keywords').split(/\r?\n/),
    // An unchecked checkbox is absent from the form data.
    active: formData.get('active') === 'on',
  };
}

export async function saveCampaignAction(_previous: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  return runWithCurrentProject(async () => {
    const result = validateCampaign(campaignFromForm(formData));
    if ('error' in result) return { error: result.error };
    const saved = saveCampaign(result.campaign, text(formData, 'id') || undefined);
    revalidatePath('/dashboard/campaigns');
    redirect(`/dashboard/campaigns#campaign-${saved.id}`);
  });
}

export async function runCampaignNowAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const id = text(formData, 'id');
    runCampaignNow(id);
    revalidatePath('/dashboard/campaigns');
    redirect(`/dashboard/campaigns?queued=${encodeURIComponent(id)}#campaign-${id}`);
  });
}

export async function deleteCampaignAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    deleteCampaign(text(formData, 'id'));
    revalidatePath('/dashboard/campaigns');
    redirect('/dashboard/campaigns');
  });
}
