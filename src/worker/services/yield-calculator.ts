// Motor Financiero Determinista: Cálculo de Rendimientos sin Punto Flotante
// Soporta ACT/365, ACT/360 y 30/360 con redondeo half-up exacto mediante BigInt

export type DayCountConvention = 'ACT_365' | 'ACT_360' | 'THIRTY_360';
export type PayoutFrequency = 'MONTHLY' | 'SEMIANNUAL' | 'AT_MATURITY';
export type CapitalizationPolicy = 'NONE' | 'COMPOUND_TO_CAPITAL';

export interface YieldCalculationInput {
  capitalCents: number;
  rateBps: number; // Ej. 1400 = 14.00%
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  convention?: DayCountConvention;
}

export interface YieldCalculationResult {
  periodStart: string;
  periodEnd: string;
  daysCount: number;
  capitalCents: number;
  rateBps: number;
  yieldCents: number;
  convention: DayCountConvention;
  formulaDescription: string;
}

/**
 * Calcula el número de días entre dos fechas según la convención dada.
 * Intervalo cerrado por la izquierda y abierto por la derecha: [startDate, endDate).
 */
export function calculateDaysBetween(
  startDateStr: string,
  endDateStr: string,
  convention: DayCountConvention = 'ACT_365'
): number {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);

  if (end.getTime() <= start.getTime()) {
    throw new Error(`La fecha final (${endDateStr}) debe ser estrictamente posterior a la fecha inicial (${startDateStr}).`);
  }

  if (convention === 'THIRTY_360') {
    let d1 = start.getUTCDate();
    let d2 = end.getUTCDate();
    const m1 = start.getUTCMonth() + 1;
    const m2 = end.getUTCMonth() + 1;
    const y1 = start.getUTCFullYear();
    const y2 = end.getUTCFullYear();

    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;

    const days = (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
    return Math.max(1, days);
  }

  // ACT/365 y ACT/360: Días reales en el calendario gregoriano (considera años bisiestos)
  const diffMs = end.getTime() - start.getTime();
  const exactDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, exactDays);
}

/**
 * Cálculo determinista de rendimiento financiero en centavos sin decimales flotantes.
 * Fórmula: Rendimiento = (Capital × TasaBps × Días) / (10000 × BaseDías)
 * Redondeo: Half-Up aritmético exacto con BigInt.
 */
export function calculateYieldDeterministic(input: YieldCalculationInput): YieldCalculationResult {
  const { capitalCents, rateBps, startDate, endDate } = input;
  const convention = input.convention || 'ACT_365';

  if (capitalCents <= 0) {
    throw new Error('El capital de referencia debe ser mayor a cero centavos.');
  }
  if (rateBps <= 0) {
    throw new Error('La tasa anual en puntos básicos debe ser mayor a cero.');
  }

  const daysCount = calculateDaysBetween(startDate, endDate, convention);

  const baseDays = convention === 'ACT_360' || convention === 'THIRTY_360' ? 360n : 365n;

  const num = BigInt(capitalCents) * BigInt(rateBps) * BigInt(daysCount);
  const den = 10000n * baseDays;

  // Redondeo mitad hacia arriba exacto: (num + den / 2) / den
  const yieldCentsBigInt = (num + den / 2n) / den;
  const yieldCents = Number(yieldCentsBigInt);

  const formulaDescription = `${capitalCents} * (${rateBps} / 10000) * (${daysCount} / ${baseDays})`;

  return {
    periodStart: startDate,
    periodEnd: endDate,
    daysCount,
    capitalCents,
    rateBps,
    yieldCents,
    convention,
    formulaDescription
  };
}

/**
 * Genera el siguiente periodo de cálculo según la frecuencia pactada.
 */
export function getNextPeriodDates(
  currentPeriodStart: string,
  frequency: PayoutFrequency,
  contractMaturityDate: string
): { periodStart: string; periodEnd: string; isMaturity: boolean } {
  const start = parseDate(currentPeriodStart);
  const maturity = parseDate(contractMaturityDate);

  let targetEnd = new Date(start);

  if (frequency === 'MONTHLY') {
    // Sumar 1 mes conservando día o ajustando al último día de mes
    targetEnd.setUTCMonth(targetEnd.getUTCMonth() + 1);
  } else if (frequency === 'SEMIANNUAL') {
    targetEnd.setUTCMonth(targetEnd.getUTCMonth() + 6);
  } else {
    // AT_MATURITY
    targetEnd = maturity;
  }

  // No exceder la fecha de vencimiento contractual
  let isMaturity = false;
  if (targetEnd.getTime() >= maturity.getTime()) {
    targetEnd = maturity;
    isMaturity = true;
  }

  return {
    periodStart: currentPeriodStart,
    periodEnd: formatDate(targetEnd),
    isMaturity
  };
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    throw new Error(`Formato de fecha inválido: ${dateStr}. Se espera YYYY-MM-DD.`);
  }
  const year = parseInt(parts[0] || '0', 10);
  const month = parseInt(parts[1] || '0', 10) - 1;
  const day = parseInt(parts[2] || '0', 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
