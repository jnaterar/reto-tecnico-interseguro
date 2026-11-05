import type { TokenResponse } from '../types';

// Envelope de error común a ambos backends: { error: { code, message, details } }.
interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

const tokenCache = new Map<string, CachedToken>();
const TOKEN_SAFETY_MARGIN_MS = 30_000;

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const envelope = body as ApiErrorBody | null;
  return new ApiError(
    status,
    envelope?.error?.code ?? 'UNKNOWN_ERROR',
    envelope?.error?.message ?? `Error HTTP ${status}`,
    envelope?.error?.details,
  );
}

async function requestJson<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, init);
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      `No se pudo conectar con ${base}. Verifica que el servicio esté levantado.`,
    );
  }

  const body = await readJson(response);
  if (!response.ok) {
    throw toApiError(response.status, body);
  }
  return body as T;
}

/**
 * Obtiene un JWT de demo y lo cachea hasta poco antes de expirar.
 * En producción el token vendría del IdP corporativo.
 */
export async function getDemoToken(base: string): Promise<string> {
  const cached = tokenCache.get(base);
  if (cached && cached.expiresAtMs - TOKEN_SAFETY_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const response = await requestJson<TokenResponse>(base, '/v1/auth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });

  tokenCache.set(base, {
    token: response.token,
    expiresAtMs: Date.now() + Math.max(0, response.expiresIn) * 1000,
  });
  return response.token;
}

/** POST autenticado con Bearer token. */
export async function authorizedPost<T>(base: string, path: string, payload: unknown): Promise<T> {
  const token = await getDemoToken(base);
  return requestJson<T>(base, path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

/** GET autenticado con Bearer token (mismo cache de token que el POST). */
export async function authorizedGet<T>(base: string, path: string): Promise<T> {
  const token = await getDemoToken(base);
  return requestJson<T>(base, path, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}

export interface HealthStatus {
  ok: boolean;
  detail: string;
}

/** Ping de healthcheck para el indicador de estado del header. */
export async function checkHealth(base: string): Promise<HealthStatus> {
  try {
    const body = await requestJson<{ status?: string }>(base, '/health');
    return { ok: body.status === 'ok', detail: body.status === 'ok' ? 'operativo' : 'degradado' };
  } catch {
    return { ok: false, detail: 'sin conexión' };
  }
}
