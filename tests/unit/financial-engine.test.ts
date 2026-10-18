import { describe, expect, it } from 'vitest';
import { calculateDaysBetween, calculateYieldDeterministic, getNextPeriodDates } from '../../src/worker/services/yield-calculator';
import { addMonthsClamped, isIsoDate, todayInContractZone } from '../../src/worker/lib/dates';

describe('Calculadora determinista (centavos enteros, BigInt)', () => {
  it('interés simple ACT/365 con redondeo half-up exacto', () => {
    // 50,000,000 × 1400 × 31 / (10000 × 365) = 594520.547… → 594521
    const r = calculateYieldDeterministic({ capitalCents: 50_000_000, rateBps: 1400, startDate: '2026-01-15', endDate: '2026-02-15' });
    expect(r.daysCount).toBe(31);
    expect(r.yieldCents).toBe(594521);
    expect(Number.isInteger(r.yieldCents)).toBe(true);
  });

  it('half-up: .5 exacto sube', () => {
    // 365 × 10000 × 1 / (10000 × 365) × ... diseñado: capital 73, 5000 bps, 1 día → 73×5000/3650000 = 0.1 → 0
    expect(calculateYieldDeterministic({ capitalCents: 73, rateBps: 5000, startDate: '2026-01-01', endDate: '2026-01-02' }).yieldCents).toBe(0);
    // 7300 × 10000 × 1 / 3650000 = 20 exacto; 365 × 10000 × 1 / 3650000 = 1 exacto; 1825×10000/3650000 = 5
    // 1825 × 1 bps × 1 día / 3650000 = 0.0005 → 0 ; 1825000 × 1 × 1 / 3650000 = 0.5 → 1
    expect(calculateYieldDeterministic({ capitalCents: 1_825_000, rateBps: 1, startDate: '2026-01-01', endDate: '2026-01-02' }).yieldCents).toBe(1);
  });

  it('ACT/360 y 30/360 con la misma tasa anual', () => {
    const base = { capitalCents: 36_000_000, rateBps: 1200, startDate: '2026-01-31', endDate: '2026-02-28' };
    expect(calculateDaysBetween(base.startDate, base.endDate, 'ACT_365')).toBe(28);
    expect(calculateYieldDeterministic({ ...base, convention: 'ACT_360' }).yieldCents).toBe(336_000);
    // 30/360: 31 ene → 30; feb 28 → (2-1)*30 + (28-30) = 28 días
    expect(calculateDaysBetween(base.startDate, base.endDate, 'THIRTY_360')).toBe(28);
  });

  it('años bisiestos: 2028 tiene 366 días reales', () => {
    expect(calculateDaysBetween('2028-01-01', '2029-01-01')).toBe(366);
    expect(calculateDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(calculateDaysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('cambio de año y fin de mes', () => {
    expect(calculateDaysBetween('2026-12-15', '2027-01-15')).toBe(31);
  });

  it('rechaza capital/tasa no enteros o no positivos y periodos invertidos', () => {
    expect(() => calculateYieldDeterministic({ capitalCents: 10.5, rateBps: 1200, startDate: '2026-01-01', endDate: '2026-02-01' })).toThrow();
    expect(() => calculateYieldDeterministic({ capitalCents: 1000, rateBps: 0, startDate: '2026-01-01', endDate: '2026-02-01' })).toThrow();
    expect(() => calculateYieldDeterministic({ capitalCents: 1000, rateBps: 100, startDate: '2026-02-01', endDate: '2026-02-01' })).toThrow();
  });
});

describe('Periodos de cobro anclados al inicio del contrato', () => {
  it('mensual sin deriva de fin de mes (31 ene → 28 feb → 31 mar)', () => {
    const p1 = getNextPeriodDates('2026-01-31', '2026-01-31', 'MONTHLY', '2027-01-31');
    expect(p1.periodEnd).toBe('2026-02-28');
    const p2 = getNextPeriodDates('2026-01-31', p1.periodEnd, 'MONTHLY', '2027-01-31');
    expect(p2.periodEnd).toBe('2026-03-31');
  });
  it('semestral, al vencimiento y tope en la fecha de vencimiento', () => {
    expect(getNextPeriodDates('2026-01-15', '2026-01-15', 'SEMIANNUAL', '2027-01-15').periodEnd).toBe('2026-07-15');
    const atMat = getNextPeriodDates('2026-01-15', '2026-01-15', 'AT_MATURITY', '2027-01-15');
    expect(atMat).toEqual({ periodStart: '2026-01-15', periodEnd: '2027-01-15', isMaturity: true });
    const last = getNextPeriodDates('2026-01-15', '2026-12-15', 'SEMIANNUAL', '2027-01-15');
    expect(last.periodEnd).toBe('2027-01-15');
    expect(last.isMaturity).toBe(true);
  });
});

describe('Fechas', () => {
  it('addMonthsClamped respeta meses cortos y bisiestos', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-08-31', 6)).toBe('2027-02-28');
    expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15');
  });
  it('isIsoDate rechaza fechas imposibles', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-1-01')).toBe(false);
  });
  it('“hoy” se calcula en America/Mexico_City', () => {
    expect(todayInContractZone(new Date('2026-10-15T04:00:00Z'))).toBe('2026-10-14');
  });
});
