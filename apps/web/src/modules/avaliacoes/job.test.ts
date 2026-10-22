import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-avaliacoes-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');

import { closeAllDatabases, createProject, getProjectDataDb } from '@/lib/db';
import { saveClientCapBrl } from '@/modules/custos/budget';
import type { EmailMessage, SendResult } from '@/modules/email/send';
import { addMonitored, getMonitored, listAlerts, markAlerts } from './monitor-db';
import { runReviewsRefresh, type ReviewsJobDeps } from './job';

const DAY = 86_400_000;
const PLACE = 'ChIJN1t_tDeuEmsRUsoyG83frY4';

let projectId: string;

beforeAll(() => {
  projectId = createProject({ name: 'Clínica', domain: 'clinica-avaliacoes.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' }).id;
});

afterAll(() => {
  closeAllDatabases();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const review = (id: string, rating: number, author: string) => ({
  review_id: id, rating: { value: rating }, profile_name: author, timestamp: '2026-10-20 10:00:00 +00:00',
  review_text: `Texto de ${author}`, review_url: `https://www.google.com/maps/reviews/${id}`,
});

/** Fake DataForSEO: every task_post gets a new ID; task_get returns whatever the test set for it. */
function fakeApi() {
  const results = new Map<string, unknown[] | 'pending'>();
  let next = 1;
  const posted: Array<Record<string, unknown>> = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/task_post')) {
      const body = JSON.parse(String(init?.body))[0];
      posted.push(body);
      const id = `task-${next++}`;
      results.set(id, 'pending');
      return Response.json({ cost: 0.0015, tasks: [{ id, status_code: 20100, cost: 0.0015 }] });
    }
    const id = decodeURIComponent(url.split('/task_get/')[1]);
    const items = results.get(id);
    if (!items || items === 'pending') return Response.json({ tasks: [{ status_code: 40602, status_message: 'Task In Queue.' }] });
    return Response.json({ tasks: [{ status_code: 20000, cost: 0, result: [{ place_id: PLACE, title: 'Clínica Sorriso', total_count: items.length, items }] }] });
  });
  return { fetchImpl, results, posted };
}

function deps(api: ReturnType<typeof fakeApi>, send: (message: EmailMessage) => Promise<SendResult>, credentials = true): ReviewsJobDeps {
  return {
    credentials: () => (credentials ? { login: 'l', pass: 'p' } : null),
    fetchImpl: api.fetchImpl as unknown as ReviewsJobDeps['fetchImpl'],
    recipients: () => ['dono@exemplo.com'],
    send,
    appUrl: null,
  };
}

describe('reviews job', () => {
  it('posts, collects a baseline, alerts new low ratings once and never posts twice', async () => {
    const id = addMonitored({ title: 'Clínica Sorriso', placeId: PLACE, location: 'Brazil', language: 'Portuguese', frequency: 'diaria' }, projectId);
    const api = fakeApi();
    const sent: EmailMessage[] = [];
    const send = async (message: EmailMessage): Promise<SendResult> => { sent.push(message); return { sent: true, id: 'x' }; };
    const day0 = new Date(Date.UTC(2026, 9, 1, 10));

    // Day 0: first refresh is posted and billed once, recorded in reviews_tasks.
    let result = await runReviewsRefresh(day0, deps(api, send));
    expect(result.message).toContain('1 tarefa enviada');
    expect(api.posted).toEqual([expect.objectContaining({ place_id: PLACE, depth: 10, sort_by: 'newest' })]);
    const row = getProjectDataDb(projectId).prepare('SELECT cost, status FROM reviews_tasks WHERE id = ?').get('task-1') as { cost: number; status: string };
    expect(row).toEqual({ cost: 0.0015, status: 'pending' });

    // Same day again: the task is still running, nothing new is posted.
    result = await runReviewsRefresh(new Date(day0.getTime() + 3_600_000), deps(api, send));
    expect(api.posted).toHaveLength(1);
    expect(result.message).toContain('1 ainda em processamento');

    // Day 1: baseline arrives (old 1-star review must not alert), next refresh is posted.
    api.results.set('task-1', [review('a', 1, 'Antiga'), review('b', 5, 'Bia')]);
    await runReviewsRefresh(new Date(day0.getTime() + DAY), deps(api, send));
    expect(getMonitored(id, projectId)?.baselineDone).toBe(true);
    expect(listAlerts(['pendente'], projectId)).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(api.posted).toHaveLength(2);
    expect((getProjectDataDb(projectId).prepare('SELECT status FROM reviews_tasks WHERE id = ?').get('task-1') as { status: string }).status).toBe('ready');

    // Day 2: two new reviews, one with 2 stars: exactly one alert e-mailed.
    api.results.set('task-2', [review('c', 2, 'Carla'), review('d', 5, 'Davi'), review('a', 1, 'Antiga'), review('b', 5, 'Bia')]);
    result = await runReviewsRefresh(new Date(day0.getTime() + 2 * DAY), deps(api, send));
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['dono@exemplo.com']);
    expect(sent[0].text).toContain('Carla');
    expect(sent[0].text).not.toContain('Davi');
    expect(sent[0].text).not.toContain('Antiga');
    expect(result.message).toContain('alerta enviado');

    // Day 3: the same reviews again: no second alert.
    api.results.set('task-3', [review('c', 2, 'Carla'), review('d', 5, 'Davi')]);
    await runReviewsRefresh(new Date(day0.getTime() + 3 * DAY), deps(api, send));
    expect(sent).toHaveLength(1);
    expect(listAlerts(['enviado'], projectId).map((alert) => alert.author)).toEqual(['Carla']);
  });

  it('keeps alerts pending when e-mail is not configured', async () => {
    const api = fakeApi();
    const id = addMonitored({ title: 'Padaria', cid: '1234567890123', location: 'Brazil', language: 'Portuguese', frequency: 'semanal' }, projectId);
    const failing = async (): Promise<SendResult> => ({ sent: false, reason: 'E-mail não configurado (SMTP_HOST e SMTP_FROM).' });
    const start = new Date(Date.UTC(2026, 10, 1, 10));
    // A database left by the first test also holds "Clínica Sorriso"; only this profile matters here.
    await runReviewsRefresh(start, deps(api, failing));
    const padariaTask = api.posted.findIndex((body) => body.cid === '1234567890123');
    expect(padariaTask).toBeGreaterThanOrEqual(0);
    expect(api.posted[padariaTask]).not.toHaveProperty('place_id');
    api.results.set(`task-${padariaTask + 1}`, [review('p1', 4, 'Paula')]);
    await runReviewsRefresh(new Date(start.getTime() + 7 * DAY), deps(api, failing));
    const second = api.posted.findLastIndex((body) => body.cid === '1234567890123');
    api.results.set(`task-${second + 1}`, [review('p2', 3, 'Pedro'), review('p1', 4, 'Paula')]);
    const result = await runReviewsRefresh(new Date(start.getTime() + 14 * DAY), deps(api, failing));
    const pending = listAlerts(['pendente'], projectId).filter((alert) => alert.monitoredId === id);
    expect(pending.map((alert) => alert.author)).toEqual(['Pedro']);
    expect(result.message).toContain('pendente');
    expect(markAlerts([{ monitoredId: id, reviewKey: 'p2' }], 'visto', projectId)).toBe(1);
    expect(markAlerts([{ monitoredId: id, reviewKey: 'p2' }], 'visto', projectId)).toBe(0);
  });

  it('skips posting at the monthly cap and without credentials', async () => {
    const other = createProject({ name: 'Loja', domain: 'loja-avaliacoes.example', defaultLocation: '', defaultLanguage: '', defaultCoordinates: '', rankTrackerDepth: '100' }).id;
    addMonitored({ title: 'Loja', keyword: 'Loja Centro', location: 'Brazil', language: 'Portuguese', frequency: 'diaria' }, other);
    const send = async (): Promise<SendResult> => ({ sent: true, id: 'x' });

    const offline = fakeApi();
    const noCreds = await runReviewsRefresh(new Date(Date.UTC(2026, 11, 1, 10)), deps(offline, send, false));
    expect(offline.fetchImpl).not.toHaveBeenCalled();
    expect(noCreds.ok).toBe(false);
    expect(noCreds.message).toContain('credenciais da DataForSEO ausentes');

    saveClientCapBrl(other, 0.01);
    getProjectDataDb(other).prepare('INSERT INTO reviews_tasks (id, ts, business, location, language, depth, sort_by, status, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run('gasto', Date.UTC(2026, 11, 1, 9), 'x', 'Brazil', 'Portuguese', 10, 'newest', 'ready', 1);
    const capped = fakeApi();
    const result = await runReviewsRefresh(new Date(Date.UTC(2026, 11, 2, 10)), deps(capped, send));
    expect(capped.posted.some((body) => body.keyword === 'Loja Centro')).toBe(false);
    expect(result.message).toContain('teto mensal');
  });
});
