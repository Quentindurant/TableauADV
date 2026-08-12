import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  apiFetch,
  archiveRow,
  createRow,
  deleteRow,
  getColumns,
  getRowEvents,
  getRows,
  moveRow,
  patchColumn,
  patchRow,
  searchRows,
} from './api';

function mockFetch(status: number, body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    const responseBody = body === null ? null : JSON.stringify(body);
    return new Response(responseBody, {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('préfixe /api, envoie les cookies et rend le corps JSON', async () => {
    const fetchMock = mockFetch(200, [{ id: 'col-1' }]);
    const result = await getColumns();
    expect(result).toEqual([{ id: 'col-1' }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/columns');
    expect(init.credentials).toBe('include');
  });

  it('rend undefined sur un 204 sans corps', async () => {
    mockFetch(204, null);
    await expect(deleteRow('row-1')).resolves.toBeUndefined();
  });

  it('transforme un 401 en ApiRequestError AUTH_REQUIRED', async () => {
    mockFetch(401, { code: 'AUTH_REQUIRED', message: 'Authentification requise.' });
    await expect(apiFetch('/rows?month=2026-08')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 401,
      message: 'Authentification requise.',
    });
  });

  it('transforme un 404 en ApiRequestError NOT_FOUND', async () => {
    mockFetch(404, { code: 'NOT_FOUND', message: 'Ligne introuvable.' });
    await expect(getRowEvents('row-x')).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('transforme un 422 en ApiRequestError VALIDATION_FAILED', async () => {
    mockFetch(422, { code: 'VALIDATION_FAILED', message: 'Mois invalide.' });
    await expect(createRow({ month: 'aout' })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
    });
  });

  it('transforme un 409 en ApiRequestError VERSION_CONFLICT et conserve les details', async () => {
    mockFetch(409, {
      code: 'VERSION_CONFLICT',
      message: 'Modifiée entre-temps.',
      details: { conflictKeys: ['statut'] },
    });
    try {
      await patchRow('row-1', { expectedVersion: 2, patch: { statut: 'NEW' } });
      throw new Error('patchRow aurait dû échouer');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiRequestError);
      expect((error as ApiRequestError).code).toBe('VERSION_CONFLICT');
      expect((error as ApiRequestError).details).toEqual({ conflictKeys: ['statut'] });
    }
  });

  it("déduit un code depuis le statut quand le corps n'est pas typé", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502</html>', { status: 502 })),
    );
    await expect(apiFetch('/months')).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 502,
    });
  });
});

describe('routes', () => {
  it('getRows construit ?month= ou ?archived=true', async () => {
    const fetchMock = mockFetch(200, []);
    await getRows({ month: '2026-08' });
    await getRows({ archived: true });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rows?month=2026-08');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/rows?archived=true');
  });

  it('searchRows encode la requête', async () => {
    const fetchMock = mockFetch(200, []);
    await searchRows('ARCADIA & CO');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rows/search?q=ARCADIA%20%26%20CO');
  });

  it('patchRow envoie expectedVersion et patch en PATCH', async () => {
    const fetchMock = mockFetch(200, { id: 'row-1', version: 3 });
    await patchRow('row-1', { expectedVersion: 2, patch: { client: 'NEO' } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/rows/row-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      expectedVersion: 2,
      patch: { client: 'NEO' },
    });
  });

  it('moveRow, archiveRow et patchColumn ciblent les bonnes routes', async () => {
    const fetchMock = mockFetch(200, { id: 'row-1' });
    await moveRow('row-1', { month: '2026-09' });
    await archiveRow('row-1', true);
    await patchColumn('col-1', { width: 240 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/rows/row-1/move');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/rows/row-1/archive');
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({
      archived: true,
    });
    expect(fetchMock.mock.calls[2][0]).toBe('/api/columns/col-1');
    expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('PATCH');
  });
});
