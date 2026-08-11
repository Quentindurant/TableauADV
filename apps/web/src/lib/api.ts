import type { ApiError, ErrorCode } from '@suivi/shared';

/**
 * Base des appels côté navigateur. En production le front et l'API sont sur
 * la même origine (derrière Apache) : la chaîne vide donne des URL relatives.
 */
export const apiBaseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * URL complète d'un chemin d'API. Convention figée par `_contracts.md`
 * (§ « Client HTTP web ») : les appelants passent un chemin SANS le préfixe
 * `/api` (`'/auth/login'`, `'/columns'`, `'/rows?month=2026-08'`), et c'est
 * cette fonction qui ajoute le préfixe global de l'API.
 */
export function apiUrl(path: string): string {
  return `${apiBaseUrl}/api${path}`;
}

/**
 * Base des appels côté serveur (Server Components) : `fetch` exige alors une
 * URL absolue, et `apiBaseUrl` est vide en production. Le préfixe `/api`
 * n'est PAS inclus : les appelants écrivent `` `${serverApiBaseUrl()}/api/auth/me` ``.
 * En production, renseigner `API_INTERNAL_URL=http://127.0.0.1:3001`.
 */
export function serverApiBaseUrl(): string {
  const internal = process.env.API_INTERNAL_URL;
  if (internal) {
    return internal;
  }
  const publicUrl = process.env.NEXT_PUBLIC_API_URL;
  if (publicUrl) {
    return publicUrl;
  }
  return 'http://localhost:3001';
}

/** `ErrorCode` du contrat, élargi au code technique 'INTERNAL' (erreur serveur/réseau). */
export type ApiErrorCode = ErrorCode | 'INTERNAL';

export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_REQUIRED',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  422: 'VALIDATION_FAILED',
};

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch {
    throw new ApiRequestError(
      'INTERNAL',
      'Serveur injoignable. Vérifiez votre connexion.',
      0,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    if (isApiError(parsed)) {
      throw new ApiRequestError(parsed.code, parsed.message, response.status, parsed.details);
    }
    throw new ApiRequestError(
      STATUS_TO_CODE[response.status] ?? 'INTERNAL',
      'Une erreur est survenue. Réessayez.',
      response.status,
    );
  }

  return parsed as T;
}

export function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'GET' });
}

export function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: 'PATCH',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDel<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, { ...init, method: 'DELETE' });
}

export const api = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  del: apiDel,
} as const;
