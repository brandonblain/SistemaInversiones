// Validación de entrada sin dependencias. Todas las funciones lanzan AppError(400) con un mensaje en español.
import type { Context } from 'hono';
import { badRequest } from './errors';
import { isIsoDate, isIsoDateTime } from './dates';

export type Body = Record<string, unknown>;

export async function readJson(c: Context): Promise<Body> {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('INVALID_INPUT', 'Se espera un cuerpo JSON válido.');
  }
  return body as Body;
}

export function str(body: Body, key: string, label: string, opts: { min?: number; max?: number; optional?: boolean } = {}): string {
  const v = body[key];
  if (v === undefined || v === null || v === '') {
    if (opts.optional) return '';
    throw badRequest('INVALID_INPUT', `${label} es obligatorio.`, { field: key });
  }
  if (typeof v !== 'string') throw badRequest('INVALID_INPUT', `${label} debe ser texto.`, { field: key });
  const t = v.trim();
  if (opts.min !== undefined && t.length < opts.min) throw badRequest('INVALID_INPUT', `${label} debe tener al menos ${opts.min} caracteres.`, { field: key });
  if (t.length > (opts.max ?? 500)) throw badRequest('INVALID_INPUT', `${label} es demasiado largo.`, { field: key });
  return t;
}

export function optStr(body: Body, key: string, label: string, max = 500): string | null {
  const v = str(body, key, label, { optional: true, max });
  return v === '' ? null : v;
}

/** Entero seguro (centavos, puntos básicos). Rechaza flotantes y strings. */
export function int(body: Body, key: string, label: string, opts: { min?: number; max?: number } = {}): number {
  const v = body[key];
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
    throw badRequest('INVALID_INPUT', `${label} debe ser un número entero (sin decimales).`, { field: key });
  }
  if (opts.min !== undefined && v < opts.min) throw badRequest('INVALID_INPUT', `${label} debe ser al menos ${opts.min}.`, { field: key });
  if (opts.max !== undefined && v > opts.max) throw badRequest('INVALID_INPUT', `${label} excede el máximo permitido.`, { field: key });
  return v;
}

export function oneOf<T extends string>(body: Body, key: string, label: string, allowed: readonly T[], fallback?: T): T {
  const v = body[key];
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw badRequest('INVALID_INPUT', `${label} debe ser uno de: ${allowed.join(', ')}.`, { field: key });
  }
  return v as T;
}

export function date(body: Body, key: string, label: string): string {
  const v = body[key];
  if (!isIsoDate(v)) throw badRequest('INVALID_INPUT', `${label} debe ser una fecha válida con formato AAAA-MM-DD.`, { field: key });
  return v;
}

export function dateTime(body: Body, key: string, label: string): string {
  const v = body[key];
  if (!isIsoDateTime(v)) throw badRequest('INVALID_INPUT', `${label} debe ser fecha y hora ISO 8601 con zona horaria.`, { field: key });
  return new Date(v).toISOString();
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;

/** Política de contraseñas (igual a la de la UI). */
export function assertPassword(pw: unknown, field = 'password'): string {
  if (typeof pw !== 'string' || pw.length < 10 || pw.length > 128) {
    throw badRequest('WEAK_PASSWORD', 'La contraseña debe tener entre 10 y 128 caracteres.', { field });
  }
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw) || !/\d/.test(pw)) {
    throw badRequest('WEAK_PASSWORD', 'La contraseña debe combinar letras y números.', { field });
  }
  return pw;
}

/** Paginación estándar ?page=&pageSize= con límites. */
export function pageParams(c: Context, defSize = 20, maxSize = 50) {
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const pageSize = Math.min(maxSize, Math.max(1, Number.parseInt(c.req.query('pageSize') ?? String(defSize), 10) || defSize));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const pagination = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize))
});

/** Comodín seguro para LIKE (escapa % y _). */
export function likePattern(term: string): string {
  return `%${term.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
