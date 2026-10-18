// Cliente HTTP para la API del Worker. La sesión viaja SOLO en la cookie HttpOnly `auth_session`;
// el frontend nunca lee ni guarda tokens (ni en localStorage ni en sessionStorage).

import type { Pagination } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: unknown = null
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuth() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
}

type UnauthorizedHandler = (err: ApiError) => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Registrado por AuthProvider: cierra la sesión en memoria cuando la API responde 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

export function notifyUnauthorized(err: ApiError) {
  onUnauthorized?.(err);
}

/** Rutas cuyo 401 es parte del flujo normal y no debe expulsar al usuario. */
const AUTH_FLOW_PATHS = ['/api/auth/login', '/api/auth/me', '/api/auth/change-password'];

interface Envelope<T> {
  success: boolean;
  data?: T;
  pagination?: Pagination;
  error?: { code: string; message: string; details?: unknown };
}

async function parseEnvelope<T>(res: Response): Promise<Envelope<T>> {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    return (await res.json()) as Envelope<T>;
  }
  return {
    success: false,
    error: { code: `HTTP_${res.status}`, message: 'Respuesta inesperada del servidor.' }
  };
}

function toError(res: Response, env: Envelope<unknown>): ApiError {
  const code = env.error?.code ?? `HTTP_${res.status}`;
  const message = env.error?.message ?? friendlyStatus(res.status);
  return new ApiError(res.status, code, message, env.error?.details ?? null);
}

function friendlyStatus(status: number): string {
  if (status === 401) return 'Su sesión expiró. Inicie sesión de nuevo.';
  if (status === 403) return 'No tiene permiso para consultar esta información.';
  if (status === 404) return 'No encontramos la información solicitada.';
  if (status === 429) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (status >= 500) return 'El servidor no está disponible. Intente más tarde.';
  return 'No se pudo completar la solicitud.';
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  try {
    return await fetch(path, init);
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Sin conexión. Revise su internet e intente de nuevo.');
  }
}

function handleFailure(path: string, err: ApiError): never {
  if (err.isAuth && !AUTH_FLOW_PATHS.includes(path)) notifyUnauthorized(err);
  throw err;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  const env = await parseEnvelope<T>(res);
  if (!res.ok || !env.success) handleFailure(path, toError(res, env));
  return env.data as T;
}

export async function requestPage<T>(path: string): Promise<{ data: T[]; pagination: Pagination }> {
  const res = await send('GET', path);
  const env = await parseEnvelope<T[]>(res);
  if (!res.ok || !env.success) handleFailure(path, toError(res, env));
  const data = env.data ?? [];
  return {
    data,
    pagination: env.pagination ?? { page: 1, pageSize: data.length, total: data.length, totalPages: 1 }
  };
}

/** Descarga privada: se pide el archivo con la cookie de sesión y se entrega como Blob (sin URL pública). */
export async function requestBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await send('GET', path);
  if (!res.ok) {
    const env = await parseEnvelope<unknown>(res);
    handleFailure(path, toError(res, env));
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  // Se prefiere filename* (UTF-8, conserva acentos) sobre filename (ASCII).
  const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition) ?? /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ? safeDecode(match[1].trim()) : null;
  return { blob: await res.blob(), filename };
}

function safeDecode(v: string) {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params) as Array<[string, unknown]>) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}
