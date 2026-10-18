// Motor Financiero Determinista: Cálculo de Rendimientos sin Punto Flotante
// Soporta ACT/365, ACT/360 y 30/360 con redondeo half-up exacto mediante BigInt.
// IMPORTANTE: la convención aplicable, las fechas de corte y el redondeo contractual están PENDIENTES
// de aprobación por escrito (docs/01-alcance-aprobado.md, decisiones 3 y 4). El motor las recibe como
// parámetros explícitos y registra la versión de cálculo en cada partida.
import { addMonthsClamped } from '../lib/dates';

export type DayCountConvention = 'ACT_365' | 'ACT_360' | 'THIRTY_360';
export type PayoutFrequency = 'MONTHLY' | 'SEMIANNUAL' | 'AT_MATURITY';
export type CapitalizationPolicy = 'NONE' | 'COMPOUND_TO_CAPITAL';

/** Versión del algoritmo; se guarda en cada partida para reproducir cálculos históricos. */
export const CALCULATION_VERSION = 'v1-simple-interest';

export interface YieldCalculationInput {
  capitalCents: number;
  rateBps: number; // 1400 = 14.00 % anual
  startDate: string; // YYYY-MM-DD (incluido)
  endDate: string; // YYYY-MM-DD (excluido): periodo [start, end)
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

/** Días del periodo [start, end) según la convención. */
export function calculateDaysBetween(startDateStr: string, endDateStr: string, convention: DayCountConvention = 'ACT_365'): number {
  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);
  if (end.getTime() <= start.getTime()) {
    throw new Error(`La fecha final (${endDateStr}) debe ser estrictamente posterior a la fecha inicial (${startDateStr}).`);
  }

  if (convention === 'THIRTY_360') {
    // 30/360 (US bond basis simplificado)
    let d1 = start.getUTCDate();
    let d2 = end.getUTCDate();
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    const days =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 360 + (end.getUTCMonth() - start.getUTCMonth()) * 30 + (d2 - d1);
    return Math.max(1, days);
  }

  // ACT: días reales de calendario (considera años bisiestos)
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Rendimiento = Capital × TasaBps × Días / (10000 × BaseDías), redondeo half-up exacto con BigInt.
 * Interés simple sobre el capital de referencia del periodo.
 */
export function calculateYieldDeterministic(input: YieldCalculationInput): YieldCalculationResult {
  const { capitalCents, rateBps, startDate, endDate } = input;
  const convention = input.convention || 'ACT_365';

  if (!Number.isSafeInteger(capitalCents) || capitalCents <= 0) throw new Error('El capital de referencia debe ser un entero mayor a cero centavos.');
  if (!Number.isSafeInteger(rateBps) || rateBps <= 0) throw new Error('La tasa anual en puntos básicos debe ser un entero mayor a cero.');

  const daysCount = calculateDaysBetween(startDate, endDate, convention);
  const baseDays = convention === 'ACT_365' ? 365n : 360n;

  const num = BigInt(capitalCents) * BigInt(rateBps) * BigInt(daysCount);
  const den = 10000n * baseDays;
  const yieldCentsBig = (num + den / 2n) / den;
  if (yieldCentsBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('El rendimiento calculado excede el rango seguro.');

  return {
    periodStart: startDate,
    periodEnd: endDate,
    daysCount,
    capitalCents,
    rateBps,
    yieldCents: Number(yieldCentsBig),
    convention,
    formulaDescription: `${capitalCents} * (${rateBps} / 10000) * (${daysCount} / ${baseDays})`
  };
}

/**
 * Siguiente periodo de cálculo a partir de `fromDate`, anclado al aniversario del inicio del contrato
 * (evita la deriva 31 ene → 28 feb → 28 mar). Nunca excede el vencimiento.
 * PENDIENTE: confirmar si el corte es por aniversario o por día fijo de calendario (decisión 4).
 */
export function getNextPeriodDates(
  contractStart: string,
  fromDate: string,
  frequency: PayoutFrequency,
  maturityDate: string
): { periodStart: string; periodEnd: string; isMaturity: boolean } {
  let end = maturityDate;
  if (frequency !== 'AT_MATURITY') {
    const step = frequency === 'MONTHLY' ? 1 : 6;
    for (let k = step; k <= 1200; k += step) {
      const candidate = addMonthsClamped(contractStart, k);
      if (candidate > fromDate) {
        end = candidate;
        break;
      }
    }
  }
  if (end >= maturityDate) return { periodStart: fromDate, periodEnd: maturityDate, isMaturity: true };
  return { periodStart: fromDate, periodEnd: end, isMaturity: false };
}

function parseDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length !== 3) throw new Error(`Formato de fecha inválido: ${dateStr}. Se espera YYYY-MM-DD.`);
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}
