'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getCredentials, getCurrentProject, getReviewsTaskMeta, getReviewsTaskResult, getReviewsTasks, runWithCurrentProject,
} from '@/lib/db';
import type { ListingMeta } from '@/modules/avaliacoes/dataforseo';
import { collectPending } from '@/modules/avaliacoes/job';
import { classifyFetched, parseFrequency, type FetchedReview } from '@/modules/avaliacoes/monitor';
import {
  addMonitored, dismissAllAlerts, markAlerts, removeMonitored, seedBaseline, setActive, setFrequency,
} from '@/modules/avaliacoes/monitor-db';
import { mapsCidUrl, parseCid, parsePlaceId } from '@/modules/avaliacoes/request-kit';

const PAGE = '/dashboard/monitor-de-avaliacoes';
const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim();
const idOf = (formData: FormData) => Number.parseInt(text(formData, 'id'), 10);

/** Monitors the profile of a ready task from Avaliações do Google; its reviews become the free baseline. */
export async function monitorFromTaskAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const taskId = text(formData, 'task_id');
    const task = getReviewsTasks().find((item) => item.id === taskId && item.status === 'ready');
    if (!task) return;
    const meta = getReviewsTaskMeta<ListingMeta>(task.id) ?? {};
    const placeId = parsePlaceId(meta.place_id);
    const cid = parseCid(meta.cid);
    const id = addMonitored({
      title: meta.title || task.business,
      placeId,
      cid,
      keyword: task.business,
      location: task.location,
      language: task.language,
      mapsUrl: cid ? mapsCidUrl(cid) : meta.url ?? null,
      frequency: parseFrequency(text(formData, 'frequency')),
    });
    const items = getReviewsTaskResult<FetchedReview>(task.id) ?? [];
    seedBaseline(id, classifyFetched(items, new Set(), true), task.ts);
    revalidatePath(PAGE);
    redirect(PAGE);
  });
}

export async function monitorManualAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    const identifier = text(formData, 'identifier');
    const placeId = parsePlaceId(identifier);
    const cid = placeId ? null : parseCid(identifier);
    const title = text(formData, 'title');
    if (!title && !placeId && !cid) return;
    addMonitored({
      title: title || placeId || cid || '',
      placeId,
      cid,
      keyword: title || null,
      location: text(formData, 'location') || 'Brazil',
      language: text(formData, 'language') || 'Portuguese',
      mapsUrl: cid ? mapsCidUrl(cid) : null,
      frequency: parseFrequency(text(formData, 'frequency')),
    });
    revalidatePath(PAGE);
  });
}

export async function setFrequencyAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    setFrequency(idOf(formData), parseFrequency(text(formData, 'frequency')));
    revalidatePath(PAGE);
  });
}

export async function toggleActiveAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    setActive(idOf(formData), text(formData, 'active') === '1');
    revalidatePath(PAGE);
  });
}

export async function removeMonitoredAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    removeMonitored(idOf(formData));
    revalidatePath(PAGE);
  });
}

export async function dismissAlertAction(formData: FormData) {
  return runWithCurrentProject(async () => {
    markAlerts([{ monitoredId: idOf(formData), reviewKey: text(formData, 'key') }], 'visto');
    revalidatePath(PAGE);
  });
}

export async function dismissAllAlertsAction() {
  return runWithCurrentProject(async () => {
    dismissAllAlerts();
    revalidatePath(PAGE);
  });
}

/** Reads finished tasks right away (task_get is free); never posts a new, paid task. */
export async function collectNowAction() {
  return runWithCurrentProject(async () => {
    await collectPending(getCurrentProject().id, getCredentials(), fetch);
    revalidatePath(PAGE);
  });
}
