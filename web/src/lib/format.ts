// Formato de presentación. NO realiza cálculos financieros: solo convierte valores que entrega la API
// (centavos enteros, puntos básicos, fechas ISO) a texto legible en español de México.

export const CONTRACT_TIME_ZONE = 'America/Mexico_City';

const pesoGrouping = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0, useGrouping: true });

/**
 * Centavos enteros → "$1,234,567.89". Usa BigInt para no pasar por punto flotante.
 * Acepta number (entero seguro) o string de dígitos.
 */
export function formatMXN(cents: number | string | bigint | null | undefined, opts: { withCode?: boolean } = {}): string {
  if (cents === null || cents === undefined || cents === '') return '—';
  let value: bigint;
  try {
    if (typeof cents === 'number' && !Number.isSafeInteger(cents)) return '—';
    value = BigInt(cents);
  } catch {
    return '—';
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const pesos = abs / 100n;
  const centavos = (abs % 100n).toString().padStart(2, '0');
  const text = `${negative ? '-' : ''}$${pesoGrouping.format(pesos)}.${centavos}`;
  return opts.withCode ? `${text} MXN` : text;
}

/** Centavos → "1234.56" sin separadores (para rellenar campos de captura). */
export function centsToPlainPesos(cents: number): string {
  const v = BigInt(cents);
  const abs = v < 0n ? -v : v;
  return `${v < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/** Puntos básicos → "14.00 %". 1400 bps = 14.00 % anual. */
export function formatRateBps(bps: number | null | undefined): string {
  if (bps === null || bps === undefined || !Number.isInteger(bps)) return '—';
  const whole = Math.trunc(bps / 100);
  const frac = String(Math.abs(bps % 100)).padStart(2, '0');
  return `${whole}.${frac} %`;
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Fecha contractual "YYYY-MM-DD" → "15 ene 2026" (o "15 de enero de 2026" con long).
 * Se interpreta como fecha de calendario: nunca se convierte de huso horario, para evitar el
 * corrimiento de un día que produce `new Date('2026-01-15')` en navegadores con UTC-6.
 */
export function formatDate(value: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!value) return '—';
  const m = DATE_ONLY.exec(value);
  if (!m) return formatDateTime(value);
  const [, y, mo, d] = m;
  const monthIdx = Number(mo) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  const day = String(Number(d));
  return style === 'long'
    ? `${day} de ${MONTHS_LONG[monthIdx]} de ${y}`
    : `${day} ${MONTHS_SHORT[monthIdx]} ${y}`;
}

/** Fecha corta para ejes de gráfica: "ene 26". */
export function formatMonthTick(value: string): string {
  const m = DATE_ONLY.exec(value);
  if (!m) return value;
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${m[1]!.slice(2)}`;
}

const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: CONTRACT_TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

/** Marca de tiempo ISO (UTC con "Z", o "YYYY-MM-DD HH:MM:SS" de SQLite en UTC) → hora de Ciudad de México. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFmt.format(date).replace(/\./g, '');
}

export function formatPeriod(start?: string | null, end?: string | null): string {
  if (!start && !end) return '—';
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toFixed(1)} MB`;
}

/** Fecha de hoy en el huso contractual, "YYYY-MM-DD". */
export function todayInContractZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONTRACT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  return parts;
}

/** Suma meses a una fecha de calendario "YYYY-MM-DD" (para prellenar el vencimiento según el plazo). */
export function addMonthsToDate(date: string, months: number): string | null {
  const m = DATE_ONLY.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  const target = new Date(Date.UTC(y, mo, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
