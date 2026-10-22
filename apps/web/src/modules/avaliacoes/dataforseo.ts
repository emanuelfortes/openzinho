// Google Reviews tasks on DataForSEO (task_post / task_get), the same endpoints the Avaliações do
// Google page uses. Posting is the billed step; task_get only reads a finished task.
import type { FetchedReview } from './monitor';

const API = 'https://api.dataforseo.com/v3/business_data/google/reviews';

export interface Credentials { login: string; pass: string }
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function authHeader(credentials: Credentials): string {
  return `Basic ${Buffer.from(`${credentials.login}:${credentials.pass}`).toString('base64')}`;
}

export interface ReviewsTaskRequest {
  placeId?: string | null;
  cid?: string | null;
  /** Business name; used only when neither place ID nor CID is known. */
  keyword?: string | null;
  location: string;
  language: string;
  depth: number;
  tag?: string;
}

/** Body of one task: the most precise identifier wins (place ID, then CID, then the name). */
export function taskBody(request: ReviewsTaskRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    location_name: request.location || 'Brazil',
    language_name: request.language || 'Portuguese',
    depth: request.depth,
    sort_by: 'newest',
  };
  if (request.placeId) body.place_id = request.placeId;
  else if (request.cid) body.cid = request.cid;
  else body.keyword = request.keyword ?? '';
  if (request.tag) body.tag = request.tag;
  return body;
}

export type PostResult = { ok: true; taskId: string; cost: number | null } | { ok: false; error: string };

export async function postReviewsTask(credentials: Credentials, request: ReviewsTaskRequest, fetchImpl: FetchLike = fetch): Promise<PostResult> {
  if (!request.placeId && !request.cid && !request.keyword?.trim()) return { ok: false, error: 'Perfil sem place ID, CID ou nome.' };
  try {
    const response = await fetchImpl(`${API}/task_post`, {
      method: 'POST',
      headers: { Authorization: authHeader(credentials), 'Content-Type': 'application/json' },
      body: JSON.stringify([taskBody(request)]),
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return { ok: false, error: `DataForSEO HTTP ${response.status}` };
    const data = await response.json() as { cost?: number; status_message?: string; tasks?: Array<{ id?: string; status_code?: number; status_message?: string; cost?: number }> };
    const task = data.tasks?.[0];
    if (!task?.id || task.status_code !== 20100) return { ok: false, error: task?.status_message ?? data.status_message ?? 'A tarefa não foi aceita.' };
    const cost = typeof task.cost === 'number' ? task.cost : typeof data.cost === 'number' ? data.cost : null;
    return { ok: true, taskId: task.id, cost };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Não foi possível conectar à DataForSEO.' };
  }
}

export interface ListingMeta {
  place_id?: string;
  cid?: string;
  title?: string;
  category?: string;
  additional_categories?: string[];
  description?: string;
  address?: string;
  phone?: string;
  website?: string;
  url?: string;
  rating?: { value?: number; votes_count?: number };
  total_count?: number;
  [key: string]: unknown;
}

export type TaskGetResult =
  | { status: 'pending' }
  | { status: 'ready'; items: FetchedReview[]; meta: ListingMeta; cost: number | null; resultCount: number }
  | { status: 'error'; message: string };

/** 40601/40602: the task is still being processed; try again on the next pass. */
const STILL_RUNNING = new Set([40601, 40602]);

export async function getReviewsTask(credentials: Credentials, taskId: string, fetchImpl: FetchLike = fetch): Promise<TaskGetResult> {
  try {
    const response = await fetchImpl(`${API}/task_get/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: authHeader(credentials) },
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) return { status: 'pending' };
    const data = await response.json() as {
      cost?: number;
      tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result_count?: number; result?: Array<ListingMeta & { items?: FetchedReview[] | null }> | null }>;
    };
    const task = data.tasks?.[0];
    if (!task) return { status: 'pending' };
    if (task.status_code === undefined || STILL_RUNNING.has(task.status_code)) return { status: 'pending' };
    if (task.status_code !== 20000) return { status: 'error', message: task.status_message ?? `Código ${task.status_code}` };
    const result = task.result?.[0];
    const { items, ...rest } = result ?? {};
    const meta: ListingMeta = {
      place_id: rest.place_id, cid: rest.cid, title: rest.title, category: rest.category,
      additional_categories: rest.additional_categories, description: rest.description, address: rest.address,
      phone: rest.phone, website: rest.website, url: rest.url, rating: rest.rating, total_count: rest.total_count,
    };
    const list = items ?? [];
    const cost = task.cost || data.cost || null;
    return { status: 'ready', items: list, meta, cost, resultCount: rest.total_count ?? task.result_count ?? list.length };
  } catch {
    return { status: 'pending' };
  }
}
