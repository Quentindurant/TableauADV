import type {
  ApiError,
  CellFormat,
  CellValue,
  ColumnDTO,
  ErrorCode,
  MonthInfo,
  RowDTO,
  RowEventDTO,
  UserDTO,
} from '@suivi/shared';

/** `ErrorCode` du contrat, élargi au code technique 'INTERNAL' (erreur serveur/réseau). */
export type ApiErrorCode = ErrorCode | 'INTERNAL';

/** Erreur métier renvoyée par l'API, avec son code des contrats. */
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

/** En prod NEXT_PUBLIC_API_URL est vide : même origine, Apache route /api. */
export const apiBaseUrl: string = process.env.NEXT_PUBLIC_API_URL ?? '';

/**
 * URL complète d'un chemin d'API. Les appelants passent un chemin SANS le
 * préfixe `/api` (`'/columns'`, `'/rows?month=2026-08'`).
 */
export function apiUrl(path: string): string {
  return `${apiBaseUrl}/api${path}`;
}

/**
 * Base des appels côté serveur (Server Components) : `fetch` exige une URL
 * absolue. Le préfixe `/api` n'est PAS inclus.
 */
export function serverApiBaseUrl(): string {
  return process.env.API_INTERNAL_URL ?? apiBaseUrl ?? 'http://localhost:3001';
}

/**
 * Mapping statut HTTP -> code métier, utilisé uniquement quand le corps de
 * la réponse n'est pas une `ApiError` exploitable. Le fallback DOIT rester
 * 'INTERNAL' : un 500/403 étiqueté 'VALIDATION_FAILED' présenterait une
 * panne serveur comme une erreur de saisie à l'utilisateur.
 */
const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'AUTH_REQUIRED',
  404: 'NOT_FOUND',
  409: 'VERSION_CONFLICT',
  422: 'VALIDATION_FAILED',
};

function isApiError(body: unknown): body is ApiError {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as { code?: unknown }).code === 'string' &&
    typeof (body as { message?: unknown }).message === 'string'
  );
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
  let body: unknown;
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!response.ok) {
    if (isApiError(body)) {
      throw new ApiRequestError(
        body.code,
        body.message,
        response.status,
        body.details,
      );
    }
    throw new ApiRequestError(
      STATUS_TO_CODE[response.status] ?? 'INTERNAL',
      'Une erreur est survenue. Réessayez.',
      response.status,
    );
  }

  return body as T;
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

// --- Helpers génériques (conservés de la Feature 2, Task 2.7) ----------------

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

// --- Authentification -------------------------------------------------------

export async function login(email: string, password: string): Promise<UserDTO> {
  const result = await apiFetch<{ user: UserDTO }>(
    '/auth/login',
    jsonBody('POST', { email, password }),
  );
  return result.user;
}

export async function logout(): Promise<void> {
  await apiFetch<void>('/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<UserDTO> {
  const result = await apiFetch<{ user: UserDTO }>('/auth/me');
  return result.user;
}

// --- Colonnes ---------------------------------------------------------------

export async function getColumns(): Promise<ColumnDTO[]> {
  return apiFetch<ColumnDTO[]>('/columns');
}

export async function patchColumn(
  id: string,
  body: { label?: string; position?: number; width?: number; visible?: boolean },
): Promise<ColumnDTO> {
  return apiFetch<ColumnDTO>(`/columns/${id}`, jsonBody('PATCH', body));
}

// --- Mois -------------------------------------------------------------------

export async function getMonths(): Promise<MonthInfo[]> {
  return apiFetch<MonthInfo[]>('/months');
}

// --- Lignes -----------------------------------------------------------------

export async function getRows(
  filter: { month: string } | { archived: true },
): Promise<RowDTO[]> {
  const query =
    'month' in filter
      ? `month=${encodeURIComponent(filter.month)}`
      : 'archived=true';
  return apiFetch<RowDTO[]>(`/rows?${query}`);
}

export async function searchRows(q: string): Promise<RowDTO[]> {
  return apiFetch<RowDTO[]>(`/rows/search?q=${encodeURIComponent(q)}`);
}

export async function createRow(body: {
  month: string;
  position?: number;
}): Promise<RowDTO> {
  return apiFetch<RowDTO>('/rows', jsonBody('POST', body));
}

export async function patchRow(
  id: string,
  body: {
    expectedVersion: number;
    patch?: Record<string, CellValue>;
    formats?: Record<string, CellFormat | null>;
  },
): Promise<RowDTO> {
  return apiFetch<RowDTO>(`/rows/${id}`, jsonBody('PATCH', body));
}

export async function moveRow(
  id: string,
  body: { month?: string; position?: number },
): Promise<RowDTO> {
  return apiFetch<RowDTO>(`/rows/${id}/move`, jsonBody('POST', body));
}

export async function archiveRow(id: string, archived: boolean): Promise<RowDTO> {
  return apiFetch<RowDTO>(`/rows/${id}/archive`, jsonBody('POST', { archived }));
}

export async function deleteRow(id: string): Promise<void> {
  await apiFetch<void>(`/rows/${id}`, { method: 'DELETE' });
}

export async function getRowEvents(id: string): Promise<RowEventDTO[]> {
  return apiFetch<RowEventDTO[]>(`/rows/${id}/events`);
}
