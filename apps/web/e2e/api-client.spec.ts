import { expect, test } from '@playwright/test';
import { ApiRequestError, api, apiFetch } from '../src/lib/api';

interface Call {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;

function stubFetch(response: Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(response);
  }) as typeof fetch;
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('api.get envoie GET avec credentials include', async () => {
  const calls = stubFetch(json({ user: { id: 'u1' } }));

  const result = await api.get<{ user: { id: string } }>('/auth/me');

  expect(result).toEqual({ user: { id: 'u1' } });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('/api/auth/me');
  expect(calls[0].init.method).toBe('GET');
  expect(calls[0].init.credentials).toBe('include');
});

test('api.post sérialise le corps en JSON et pose Content-Type', async () => {
  const calls = stubFetch(json({ user: { id: 'u1' } }));

  await api.post('/auth/login', { email: 'a@b.fr', password: 'x' });

  expect(calls[0].init.method).toBe('POST');
  expect(calls[0].init.body).toBe('{"email":"a@b.fr","password":"x"}');
  expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe('application/json');
});

test('une réponse 204 renvoie undefined sans tenter de parser le corps', async () => {
  stubFetch(new Response(null, { status: 204 }));

  await expect(api.del('/rows/r1')).resolves.toBeUndefined();
});

test('une ApiError du serveur devient une ApiRequestError typée', async () => {
  stubFetch(
    json(
      { code: 'AUTH_INVALID', message: 'E-mail ou mot de passe incorrect.' },
      401,
    ),
  );

  const error = await api.post('/auth/login', {}).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(ApiRequestError);
  const api_error = error as ApiRequestError;
  expect(api_error.code).toBe('AUTH_INVALID');
  expect(api_error.message).toBe('E-mail ou mot de passe incorrect.');
  expect(api_error.status).toBe(401);
});

test('les details du serveur sont conservés (422 VALIDATION_FAILED)', async () => {
  stubFetch(
    json(
      {
        code: 'VALIDATION_FAILED',
        message: 'Données invalides.',
        details: [{ path: 'email', message: 'Adresse e-mail invalide' }],
      },
      422,
    ),
  );

  const error = (await api
    .post('/users', {})
    .catch((e: unknown) => e)) as ApiRequestError;

  expect(error.code).toBe('VALIDATION_FAILED');
  expect(error.details).toEqual([{ path: 'email', message: 'Adresse e-mail invalide' }]);
});

test('un corps non JSON est traduit par le code déduit du statut', async () => {
  stubFetch(new Response('<html>Bad Gateway</html>', { status: 502 }));

  const error = (await apiFetch('/rows').catch((e: unknown) => e)) as ApiRequestError;

  expect(error.code).toBe('INTERNAL');
  expect(error.message).toBe('Une erreur est survenue. Réessayez.');
  expect(error.status).toBe(502);
});

test('un 401 sans corps exploitable est traduit en AUTH_REQUIRED', async () => {
  stubFetch(new Response('', { status: 401 }));

  const error = (await apiFetch('/auth/me').catch((e: unknown) => e)) as ApiRequestError;

  expect(error.code).toBe('AUTH_REQUIRED');
});

test('une panne réseau devient une ApiRequestError INTERNAL de statut 0', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;

  const error = (await apiFetch('/auth/me').catch((e: unknown) => e)) as ApiRequestError;

  expect(error.code).toBe('INTERNAL');
  expect(error.status).toBe(0);
  expect(error.message).toBe('Serveur injoignable. Vérifiez votre connexion.');
});
