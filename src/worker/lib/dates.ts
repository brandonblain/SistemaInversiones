// Fechas contractuales "YYYY-MM-DD" (sin hora) y huso horario de operación.
export const CONTRACT_TIME_ZONE = 'America/Mexico_City';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true si es una fecha de calendario válida "YYYY-MM-DD" (rechaza 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Fecha de hoy en el huso contractual (no UTC). */
export function todayInContractZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTRACT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

/**
 * Suma meses a una fecha conservando el día; si el mes destino es más corto, usa su último día
 * (31 ene + 1 mes = 28/29 feb). La convención de fechas de corte está PENDIENTE de aprobación.
 */
export function addMonthsClamped(date: string, months: number): string {
  const m = DATE_ONLY.exec(date);
  if (!m) throw new Error(`Fecha inválida: ${date}`);
  const y = Number(m[1]);
  const mo0 = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const ty = y + Math.floor(mo0 / 12);
  const tm1 = (((mo0 % 12) + 12) % 12) + 1;
  const day = Math.min(d, daysInMonth(ty, tm1));
  return `${ty}-${String(tm1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date: string, days: number): string {
  const m = DATE_ONLY.exec(date);
  if (!m) throw new Error(`Fecha inválida: ${date}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return dt.toISOString().slice(0, 10);
}

/** ISO 8601 con zona (p. ej. "2026-03-16T14:30:00Z" o "...-06:00"). */
export function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

/** Fecha de calendario en CDMX de un instante ISO. */
export function contractDateOf(isoDateTime: string): string {
  return todayInContractZone(new Date(isoDateTime));
}
