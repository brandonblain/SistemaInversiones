import { describe, it, expect, beforeEach } from 'vitest';
import { createTestD1Database } from '../helpers/d1-mock';
import {
  calculateYieldDeterministic,
  calculateDaysBetween,
  getNextPeriodDates
} from '../../src/worker/services/yield-calculator';
import {
  confirmYieldEntry,
  recordManualYield,
  reverseYieldEntry,
  recordExternalPayment,
  executeReinvestment,
  getInvestmentFinancialSummary
} from '../../src/worker/services/payment-ledger';

describe('Financial Engine & Ledger Suite (No Floating Point)', () => {
  let db: D1Database;

  beforeEach(async () => {
    db = createTestD1Database();

    // Crear usuarios de prueba
    await db.prepare(
      "INSERT INTO users (id, email, password_hash, role, is_active) VALUES ('u_admin', 'admin@test.com', 'h', 'ADMIN', 1)"
    ).run();

    await db.prepare(
      "INSERT INTO users (id, email, password_hash, role, is_active) VALUES ('u_inv', 'inv@test.com', 'h', 'INVESTOR', 1)"
    ).run();

    await db.prepare(
      "INSERT INTO investor_profiles (id, user_id, full_name) VALUES ('p_inv', 'u_inv', 'Inversionista Prueba')"
    ).run();

    // Crear Inversión 1: $1,000,000.00 MXN (100,000,000 centavos) con tasa 12.00% anual (1200 bps), mensual, ACT_365, NONE
    await db.prepare(
      `INSERT INTO investments (id, investor_user_id, code, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents)
       VALUES ('inv_1', 'u_inv', 'INV-2026-001', 'ACTIVE', 'MXN', '2026-01-01', '2027-01-01', 100000000, 100000000)`
    ).run();

    await db.prepare(
      `INSERT INTO investment_terms (id, investment_id, fixed_annual_rate_bps, payout_frequency, day_count_convention, capitalization_policy, effective_from)
       VALUES ('term_1', 'inv_1', 1200, 'MONTHLY', 'ACT_365', 'NONE', '2026-01-01')`
    ).run();

    // Crear Inversión 2: $500,000.00 MXN con política COMPOUND_TO_CAPITAL
    await db.prepare(
      `INSERT INTO investments (id, investor_user_id, code, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents)
       VALUES ('inv_compound', 'u_inv', 'INV-2026-002', 'ACTIVE', 'MXN', '2026-01-01', '2027-01-01', 50000000, 50000000)`
    ).run();

    await db.prepare(
      `INSERT INTO investment_terms (id, investment_id, fixed_annual_rate_bps, payout_frequency, day_count_convention, capitalization_policy, effective_from)
       VALUES ('term_2', 'inv_compound', 1400, 'MONTHLY', 'ACT_365', 'COMPOUND_TO_CAPITAL', '2026-01-01')`
    ).run();
  });

  it('should calculate exact yield in integer cents with deterministic rounding', () => {
    // $1,000,000.00 MXN = 100,000,000 centavos
    // Tasa 12.00% = 1200 bps
    // Periodo: 31 días (enero 2026: 2026-01-01 a 2026-02-01)
    // Formula ACT_365: 100000000 * 0.12 * (31 / 365) = 1,019,178.08219... centavos -> redondeado: 1019178 centavos ($10,191.78 MXN)
    const res = calculateYieldDeterministic({
      capitalCents: 100000000,
      rateBps: 1200,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      convention: 'ACT_365'
    });

    expect(res.daysCount).toBe(31);
    expect(res.yieldCents).toBe(1019178);
    expect(Number.isInteger(res.yieldCents)).toBe(true);

    // ACT_360: 100000000 * 0.12 * (31 / 360) = 1,033,333.333... -> 1033333 centavos ($10,333.33 MXN)
    const res360 = calculateYieldDeterministic({
      capitalCents: 100000000,
      rateBps: 1200,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      convention: 'ACT_360'
    });
    expect(res360.yieldCents).toBe(1033333);

    // THIRTY_360: 30 días -> 100000000 * 0.12 * (30 / 360) = 1000000 centavos ($10,000.00 MXN exacto)
    const res30_360 = calculateYieldDeterministic({
      capitalCents: 100000000,
      rateBps: 1200,
      startDate: '2026-01-01',
      endDate: '2026-02-01',
      convention: 'THIRTY_360'
    });
    expect(res30_360.yieldCents).toBe(1000000);
  });

  it('should accurately handle leap years (año bisiesto)', () => {
    // 2024 es bisiesto (febrero tiene 29 días: 2024-02-01 a 2024-03-01)
    const leapDays = calculateDaysBetween('2024-02-01', '2024-03-01', 'ACT_365');
    expect(leapDays).toBe(29);

    // 2025 no es bisiesto (febrero tiene 28 días: 2025-02-01 a 2025-03-01)
    const nonLeapDays = calculateDaysBetween('2025-02-01', '2025-03-01', 'ACT_365');
    expect(nonLeapDays).toBe(28);
  });

  it('should generate periods correctly for monthly, semiannual and at-maturity', () => {
    const monthly = getNextPeriodDates('2026-01-15', 'MONTHLY', '2027-01-15');
    expect(monthly.periodStart).toBe('2026-01-15');
    expect(monthly.periodEnd).toBe('2026-02-15');
    expect(monthly.isMaturity).toBe(false);

    const semiannual = getNextPeriodDates('2026-01-15', 'SEMIANNUAL', '2027-01-15');
    expect(semiannual.periodEnd).toBe('2026-07-15');

    const maturity = getNextPeriodDates('2026-01-15', 'AT_MATURITY', '2027-01-15');
    expect(maturity.periodEnd).toBe('2027-01-15');
    expect(maturity.isMaturity).toBe(true);
  });

  it('should idempotently confirm yields without duplicating on double-click', async () => {
    const input = {
      investmentId: 'inv_1',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      daysCount: 31,
      referenceCapitalCents: 100000000,
      rateBps: 1200,
      amountCents: 1019178,
      recordedByUserId: 'u_admin'
    };

    // 1er click
    const res1 = await confirmYieldEntry(db, input);
    expect(res1.isExisting).toBe(false);
    expect(res1.amountCents).toBe(1019178);

    // 2do click con los mismos parámetros (idempotencia)
    const res2 = await confirmYieldEntry(db, input);
    expect(res2.isExisting).toBe(true);
    expect(res2.id).toBe(res1.id);

    // Verificar en BD que solo existe 1 registro
    const rows = await db.prepare(
      "SELECT id FROM yield_entries WHERE investment_id = 'inv_1' AND period_start = '2026-01-01' AND status = 'CONFIRMED'"
    ).all();
    expect(rows.results.length).toBe(1);
  });

  it('should support manual yields, reversals with contra-entries and preserve audit trail', async () => {
    // 1. Crear rendimiento regular
    const yield1 = await confirmYieldEntry(db, {
      investmentId: 'inv_1',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      daysCount: 31,
      referenceCapitalCents: 100000000,
      rateBps: 1200,
      amountCents: 1019178,
      recordedByUserId: 'u_admin'
    });

    const summaryBefore = await getInvestmentFinancialSummary(db, 'inv_1');
    expect(summaryBefore.rendimientoConfirmadoCents).toBe(1019178);
    expect(summaryBefore.rendimientoPendienteCents).toBe(1019178);

    // 2. Reversar rendimiento
    const rev = await reverseYieldEntry(db, yield1.id, 'Corrección por fecha de corte errónea', 'u_admin');
    expect(rev.reversalId).toBeDefined();

    // 3. Verificar que el saldo confirmado neto sea 0
    const summaryAfter = await getInvestmentFinancialSummary(db, 'inv_1');
    expect(summaryAfter.rendimientoConfirmadoCents).toBe(0);
    expect(summaryAfter.rendimientoPendienteCents).toBe(0);

    // 4. Agregar rendimiento manual extraordinario
    const manual = await recordManualYield(db, {
      investmentId: 'inv_1',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      amountCents: 500000, // $5,000.00 MXN
      reason: 'Bono extraordinario acordado en adenda 01',
      recordedByUserId: 'u_admin'
    });
    expect(manual.id).toBeDefined();

    const summaryManual = await getInvestmentFinancialSummary(db, 'inv_1');
    expect(summaryManual.rendimientoConfirmadoCents).toBe(500000);
    expect(summaryManual.rendimientoPendienteCents).toBe(500000);
  });

  it('should record external payments and handle partial allocations accurately', async () => {
    // 1. Confirmar un rendimiento de $10,000.00 MXN (1,000,000 centavos)
    const yieldEntry = await confirmYieldEntry(db, {
      investmentId: 'inv_1',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      daysCount: 31,
      referenceCapitalCents: 100000000,
      rateBps: 1200,
      amountCents: 1000000,
      recordedByUserId: 'u_admin'
    });

    // 2. Pago parcial 1: $4,000.00 MXN (400,000 centavos)
    const pay1 = await recordExternalPayment(db, {
      investmentId: 'inv_1',
      amountCents: 400000,
      paidAt: '2026-02-05T12:00:00Z',
      reference: 'SPEI-PARTIAL-001',
      recordedByUserId: 'u_admin',
      allocations: [{ yieldEntryId: yieldEntry.id, amountCents: 400000 }]
    });
    expect(pay1.paymentId).toBeDefined();

    let balance = await getInvestmentFinancialSummary(db, 'inv_1');
    expect(balance.rendimientoConfirmadoCents).toBe(1000000);
    expect(balance.rendimientoPagadoCents).toBe(400000);
    expect(balance.rendimientoPendienteCents).toBe(600000); // $6,000.00 MXN pendiente

    // 3. Intentar sobre-asignar más del remanente (debe fallar)
    await expect(
      recordExternalPayment(db, {
        investmentId: 'inv_1',
        amountCents: 700000,
        paidAt: '2026-02-10T12:00:00Z',
        reference: 'SPEI-OVERFLOW',
        recordedByUserId: 'u_admin',
        allocations: [{ yieldEntryId: yieldEntry.id, amountCents: 700000 }]
      })
    ).rejects.toThrow(/excede el saldo pendiente/);

    // 4. Pago parcial 2 liquidando el restante: $6,000.00 MXN (600,000 centavos)
    await recordExternalPayment(db, {
      investmentId: 'inv_1',
      amountCents: 600000,
      paidAt: '2026-02-10T12:00:00Z',
      reference: 'SPEI-FINAL-002',
      recordedByUserId: 'u_admin',
      allocations: [{ yieldEntryId: yieldEntry.id, amountCents: 600000 }]
    });

    balance = await getInvestmentFinancialSummary(db, 'inv_1');
    expect(balance.rendimientoConfirmadoCents).toBe(1000000);
    expect(balance.rendimientoPagadoCents).toBe(1000000);
    expect(balance.rendimientoPendienteCents).toBe(0);
  });

  it('should strictly enforce capitalization policy (reinvestment permitted vs denied)', async () => {
    // 1. En inv_1, la política es 'NONE'. La reinversión debe ser denegada.
    const yield1 = await confirmYieldEntry(db, {
      investmentId: 'inv_1',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      daysCount: 31,
      referenceCapitalCents: 100000000,
      rateBps: 1200,
      amountCents: 1000000,
      recordedByUserId: 'u_admin'
    });

    await expect(
      executeReinvestment(db, {
        investmentId: 'inv_1',
        yieldEntryId: yield1.id,
        effectiveDate: '2026-02-01',
        recordedByUserId: 'u_admin'
      })
    ).rejects.toThrow(/no permite la reinversión/);

    // 2. En inv_compound, la política es 'COMPOUND_TO_CAPITAL'. La reinversión debe permitirse y sumar al capital.
    const yield2 = await confirmYieldEntry(db, {
      investmentId: 'inv_compound',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-01',
      daysCount: 31,
      referenceCapitalCents: 50000000, // $500,000.00
      rateBps: 1400,
      amountCents: 594521, // Rendimiento
      recordedByUserId: 'u_admin'
    });

    const reinvestRes = await executeReinvestment(db, {
      investmentId: 'inv_compound',
      yieldEntryId: yield2.id,
      effectiveDate: '2026-02-01',
      recordedByUserId: 'u_admin'
    });

    expect(reinvestRes.reinvestmentId).toBeDefined();
    // Nuevo capital = 50,000,000 + 594,521 = 50,594,521 centavos
    expect(reinvestRes.newCapitalCents).toBe(50594521);

    const balanceCompound = await getInvestmentFinancialSummary(db, 'inv_compound');
    expect(balanceCompound.capitalVigenteCents).toBe(50594521);
    expect(balanceCompound.rendimientoConfirmadoCents).toBe(594521);
    expect(balanceCompound.rendimientoReinvertidoCents).toBe(594521);
    expect(balanceCompound.rendimientoPendienteCents).toBe(0);
  });
});
