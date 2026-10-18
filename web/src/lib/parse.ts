// Conversión de captura del administrador a las unidades del contrato de API.
// Solo traduce texto a enteros; no calcula rendimientos.

/**
 * "150,000.50" | "150000.5" | "$150,000" → 15000050 centavos. Devuelve null si no es válido.
 * allowNegative: para ajustes manuales.
 */
export function parsePesosToCents(input: string, opts: { allowNegative?: boolean } = {}): number | null {
  const cleaned = input.trim().replace(/[$\s]/g, '').replace(/,/g, '').replace(/MXN$/i, '');
  const re = opts.allowNegative ? /^-?\d+(\.\d{1,2})?$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const [intPart = '0', fracPart = ''] = cleaned.replace('-', '').split('.');
  const cents = BigInt(intPart) * 100n + BigInt(fracPart.padEnd(2, '0') || '0');
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const n = Number(cents);
  return negative ? -n : n;
}

/** "14" | "14.5" | "14.25 %" → 1425 puntos básicos. Máximo 2 decimales. */
export function parsePercentToBps(input: string): number | null {
  const cleaned = input.trim().replace(/[%\s]/g, '');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [intPart = '0', fracPart = ''] = cleaned.split('.');
  return Number(intPart) * 100 + Number(fracPart.padEnd(2, '0'));
}

/** Combina fecha y hora capturadas en Ciudad de México (UTC-6, sin horario de verano desde 2022) a ISO. */
export function mexicoCityLocalToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00-06:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
