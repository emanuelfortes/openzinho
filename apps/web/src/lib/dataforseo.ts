/**
 * Shared fetch/auth/error-unwrap helper for DataForSEO's `.../live` endpoints. Every page used to
 * reimplement this boilerplate (Basic auth header, `tasks[0].status_code !== 20000` check, JSON
 * parsing) inline — some of them skipped the status_code check entirely, and 28 of them had no
 * try/catch around the fetch at all, so a network blip crashed the server component instead of
 * showing the app's normal inline error banner. This centralizes it so every call gets the same
 * error handling for free.
 *
 * Not used by the async task_post/task_get polling flows (OnPage Site Audit/Microdata, Google
 * Reviews, Geo-Grid) — those have a genuinely different request/response shape (submit a task,
 * poll separately for its result) that doesn't fit a single-call helper.
 */

/**
 * pt-BR text for the DataForSEO status codes the app runs into. DataForSEO only answers in English,
 * and its `status_message` used to reach the screen verbatim.
 * See https://docs.dataforseo.com/v3/appendix/errors/.
 */
const STATUS_MESSAGES_PT: Record<number, string> = {
  40000: 'A DataForSEO recusou a requisição.',
  40100: 'A DataForSEO não autorizou o acesso. Confira o login e a senha da API nas configurações.',
  40101: 'Falha na autenticação da DataForSEO. Confira o login e a senha da API nas configurações.',
  40102: 'A DataForSEO não encontrou resultados para esta busca.',
  40200: 'Saldo insuficiente na DataForSEO. Adicione créditos à conta para continuar.',
  40202: 'Limite de requisições por minuto da DataForSEO atingido. Aguarde um pouco e tente novamente.',
  40400: 'A DataForSEO não encontrou o recurso solicitado.',
  40401: 'A DataForSEO não encontrou esta tarefa.',
  40503: 'A DataForSEO recusou os dados enviados (formato inválido).',
  40601: 'A tarefa foi recebida pela DataForSEO e ainda vai começar.',
  40602: 'A tarefa está na fila da DataForSEO; o resultado ainda não está pronto.',
  50000: 'Erro interno da DataForSEO. Tente novamente em alguns minutos.',
  50304: 'Esta função da DataForSEO está temporariamente indisponível. Tente novamente mais tarde.',
};

/**
 * Turns a DataForSEO status (code + English message) into a pt-BR message for the UI. Unknown
 * codes keep the original message, prefixed so the user still sees what DataForSEO said.
 */
export function dataForSeoStatusMessage(code: number | null | undefined, message?: string | null): string {
  const original = message?.trim() ?? '';
  if (code === 40501) {
    // "Invalid Field: 'location_name'." → keep the field name, it's what the user has to fix.
    const field = original.match(/^invalid field:\s*(.+?)\.?$/i)?.[1]?.replace(/^['"]|['"]$/g, '').trim();
    return field
      ? `A DataForSEO recusou um campo inválido na requisição: ${field}.`
      : 'A DataForSEO recusou um campo inválido na requisição.';
  }
  if (code != null && STATUS_MESSAGES_PT[code]) return STATUS_MESSAGES_PT[code];
  if (code == null) return original ? `Erro da DataForSEO: ${original}` : 'Erro da DataForSEO.';
  return original ? `Erro da DataForSEO (código ${code}): ${original}` : `Erro da DataForSEO (código ${code}).`;
}

export interface DfsCredentials {
  login: string;
  pass: string;
}

export interface DfsTaskResult<T> {
  result?: T[];
  cost?: number;
  error?: string;
}

/**
 * Calls a DataForSEO `/v3/<endpoint>/live` (or similar single-task) POST endpoint. Wraps `body` in
 * the `[...]` task array the API expects unless it's already an array. Returns the first task's
 * full `result` array — use this directly for bulk/multi-item results (e.g. `keywords_search_volume`
 * returning one item per input keyword), or see `callDataForSeoFirst` for the common single-result
 * case (`result[0]` holding `{ items, total_count }` or similar).
 */
export async function callDataForSeo<T>(
  endpoint: string,
  body: Record<string, unknown> | Record<string, unknown>[],
  creds: DfsCredentials,
  timeoutMs?: number,
): Promise<DfsTaskResult<T>> {
  const auth = btoa(`${creds.login}:${creds.pass}`);

  let res: Response;
  try {
    res = await fetch(`https://api.dataforseo.com/v3/${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(Array.isArray(body) ? body : [body]),
      signal: timeoutMs != null ? AbortSignal.timeout(timeoutMs) : undefined,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') return { error: `A requisição expirou após ${timeoutMs} ms.` };
    return { error: err instanceof Error ? `Erro de rede: ${err.message}` : 'Erro de rede.' };
  }

  if (!res.ok) return { error: `Erro da API ${res.status}: ${res.statusText}` };

  let data: { status_code?: number; status_message?: string; tasks?: Array<{ status_code?: number; status_message?: string; cost?: number; result?: T[] }> | null };
  try {
    data = await res.json();
  } catch {
    return { error: 'Resposta inválida da API (não é JSON).' };
  }

  // Request-level failures (e.g. 50304 "function temporarily unavailable") come back with `tasks: null`
  // and the reason only in the top-level status, so surface that instead of a generic message.
  if (data?.status_code && data.status_code !== 20000) return { error: dataForSeoStatusMessage(data.status_code, data.status_message) };
  const task = data?.tasks?.[0];
  if (!task) return { error: 'Resposta vazia da API.' };
  if (task.status_code && task.status_code !== 20000) return { error: dataForSeoStatusMessage(task.status_code, task.status_message) };
  return { result: task.result, cost: task.cost };
}

/** Convenience for the common case: one task, caller wants `result[0]` (not the raw array). */
export async function callDataForSeoFirst<T>(
  endpoint: string,
  body: Record<string, unknown> | Record<string, unknown>[],
  creds: DfsCredentials,
  timeoutMs?: number,
): Promise<{ result?: T; cost?: number; error?: string }> {
  const { result, cost, error } = await callDataForSeo<T>(endpoint, body, creds, timeoutMs);
  return { result: result?.[0], cost, error };
}
