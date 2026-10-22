import { describe, it, expect, vi, afterEach } from 'vitest';
import { callDataForSeo, callDataForSeoFirst, dataForSeoStatusMessage } from './dataforseo';

const creds = { login: 'user', pass: 'pass' };

function mockFetchOnce(impl: () => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

describe('callDataForSeo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the task result array and cost on a successful call', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 20000, cost: 0.05, result: [{ foo: 'bar' }] }],
    }), { status: 200 }));

    const res = await callDataForSeo<{ foo: string }>('some/endpoint/live', { keyword: 'x' }, creds);
    expect(res).toEqual({ result: [{ foo: 'bar' }], cost: 0.05 });
  });

  it('sends a Basic auth header built from the given credentials', async () => {
    let capturedHeaders: HeadersInit | undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedHeaders = init.headers;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', { a: 1 }, { login: 'me', pass: 'secret' });
    const headers = capturedHeaders as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa('me:secret')}`);
  });

  it('wraps a non-array body in a single-element task array', async () => {
    let capturedBody: string | undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedBody = init.body as string;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', { keyword: 'x' }, creds);
    expect(JSON.parse(capturedBody!)).toEqual([{ keyword: 'x' }]);
  });

  it('returns an error when DataForSEO reports a non-20000 status_code', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 40501, status_message: 'Invalid Field: location_name.' }],
    }), { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('A DataForSEO recusou um campo inválido na requisição: location_name.');
    expect(res.result).toBeUndefined();
  });

  it('returns an error on a non-OK HTTP response instead of throwing', async () => {
    mockFetchOnce(() => new Response('', { status: 502, statusText: 'Bad Gateway' }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Erro da API 502: Bad Gateway');
  });

  it('returns an error instead of throwing when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('getaddrinfo ENOTFOUND'))));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Erro de rede: getaddrinfo ENOTFOUND');
  });

  it('returns a clear timeout error instead of throwing when the request exceeds timeoutMs', async () => {
    vi.stubGlobal('fetch', vi.fn(() => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      return Promise.reject(err);
    }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds, 20_000);
    expect(res.error).toBe('A requisição expirou após 20000 ms.');
  });

  it('passes an AbortSignal.timeout(timeoutMs) through to fetch when timeoutMs is given', async () => {
    let capturedSignal: AbortSignal | undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedSignal = init.signal ?? undefined;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', {}, creds, 5_000);
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it('does not set a signal at all when timeoutMs is omitted', async () => {
    let capturedSignal: AbortSignal | null | undefined = 'unset' as unknown as undefined;
    mockFetchOnce((...args: unknown[]) => {
      const init = args[1] as RequestInit;
      capturedSignal = init.signal;
      return new Response(JSON.stringify({ tasks: [{ status_code: 20000, result: [] }] }), { status: 200 });
    });

    await callDataForSeo('some/endpoint/live', {}, creds);
    expect(capturedSignal).toBeUndefined();
  });

  it('returns an error instead of throwing when the response body is not valid JSON', async () => {
    mockFetchOnce(() => new Response('<html>not json</html>', { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Resposta inválida da API (não é JSON).');
  });

  it('returns an error when the response has no tasks', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({ tasks: [] }), { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Resposta vazia da API.');
  });

  it('surfaces the top-level status message when the whole request is rejected', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      status_code: 50304,
      status_message: 'This function temporarily unavailable. Please contact support for more information.',
      tasks: null,
    }), { status: 200 }));

    const res = await callDataForSeo('some/endpoint/live', {}, creds);
    expect(res.error).toBe('Esta função da DataForSEO está temporariamente indisponível. Tente novamente mais tarde.');
  });
});

describe('callDataForSeoFirst', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unwraps result[0] instead of returning the raw array', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 20000, cost: 0.01, result: [{ items: [1, 2, 3] }] }],
    }), { status: 200 }));

    const res = await callDataForSeoFirst<{ items: number[] }>('some/endpoint/live', {}, creds);
    expect(res).toEqual({ result: { items: [1, 2, 3] }, cost: 0.01 });
  });

  it('propagates an error the same way as callDataForSeo', async () => {
    mockFetchOnce(() => new Response(JSON.stringify({
      tasks: [{ status_code: 40400, status_message: 'Not Found.' }],
    }), { status: 200 }));

    const res = await callDataForSeoFirst('some/endpoint/live', {}, creds);
    expect(res.error).toBe('A DataForSEO não encontrou o recurso solicitado.');
    expect(res.result).toBeUndefined();
  });
});

describe('dataForSeoStatusMessage', () => {
  it.each([
    [40100, 'You are not authorized to access this resource.', /não autorizou o acesso/],
    [40101, 'Authentication failed.', /Falha na autenticação/],
    [40200, 'Payment Required.', /Saldo insuficiente/],
    [40202, 'Rate limit per minute exceeded.', /Limite de requisições por minuto/],
    [40400, 'Not Found.', /não encontrou o recurso/],
    [40601, 'Task Handed.', /recebida pela DataForSEO/],
    [40602, 'Task In Queue.', /na fila da DataForSEO/],
    [50000, 'Internal Error.', /Erro interno da DataForSEO/],
  ])('translates code %i to Portuguese', (code, message, expected) => {
    const text = dataForSeoStatusMessage(code, message);
    expect(text).toMatch(expected);
    expect(text).not.toContain(message);
  });

  it('keeps the field name of an invalid-field error', () => {
    expect(dataForSeoStatusMessage(40501, "Invalid Field: 'location_name'.")).toBe('A DataForSEO recusou um campo inválido na requisição: location_name.');
    expect(dataForSeoStatusMessage(40501, 'Invalid Field.')).toBe('A DataForSEO recusou um campo inválido na requisição.');
  });

  it('falls back to the code and the original message for unknown statuses', () => {
    expect(dataForSeoStatusMessage(40999, 'Something unusual.')).toBe('Erro da DataForSEO (código 40999): Something unusual.');
    expect(dataForSeoStatusMessage(40999)).toBe('Erro da DataForSEO (código 40999).');
  });

  it('handles a missing code', () => {
    expect(dataForSeoStatusMessage(undefined, 'Oops')).toBe('Erro da DataForSEO: Oops');
    expect(dataForSeoStatusMessage(undefined)).toBe('Erro da DataForSEO.');
  });
});
