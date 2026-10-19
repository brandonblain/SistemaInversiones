import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/worker/index';
import { ADMIN_PASSWORD, confirmPeriod, createInvestment, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

describe('Monedas, inversión a CETES − 1 punto y modalidad anual', () => {
  let env: Env;
  let admin: Client;
  let investorId: string;

  beforeEach(async () => {
    env = makeEnv();
    await seedAdmin(env);
    investorId = await seedInvestor(env, { email: 'victoria.perez@ficticio.test', name: 'Victoria Pérez' });
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
  });

  const cetes = (overrides: Record<string, unknown> = {}) =>
    createInvestment(admin, investorId, {
      investment_type: 'CETES',
      currency: 'MXN',
      reference_rate_code: 'CETES_28',
      spread_bps: -100,
      fixed_annual_rate_bps: undefined,
      capital_cents: 36_500_000,
      start_date: '2026-01-01',
      maturity_date: '2027-01-01',
      ...overrides
    });
  const addRate = (date: string, bps: number, code = 'CETES_28') =>
    admin.call('POST', '/api/admin/reference-rates', { rate_code: code, effective_date: date, annual_rate_bps: bps, source: 'Banxico (FICTICIO)' });

  it('CETES − 1 punto: usa la tasa vigente al inicio del periodo y exige capturarla', async () => {
    const id = await cetes();
    const missing = await admin.call('POST', '/api/admin/yields/preview', { investment_id: id, period_start: '2026-01-01', period_end: '2026-02-01' });
    expect(missing.status).toBe(409);
    expect(missing.json.error.code).toBe('REFERENCE_RATE_MISSING');

    expect((await addRate('2025-12-30', 1100)).status).toBe(201); // 11.00 %
    expect((await addRate('2026-01-15', 1050)).status).toBe(201); // 10.50 % (a mitad del periodo: no aplica a enero)
    const p = await admin.call('POST', '/api/admin/yields/preview', { investment_id: id, period_start: '2026-01-01', period_end: '2026-02-01' });
    expect(p.json.data).toMatchObject({
      rate_type: 'REFERENCE',
      reference_rate_code: 'CETES_28',
      reference_rate_bps: 1100,
      reference_rate_date: '2025-12-30',
      spread_bps: -100,
      annual_rate_bps: 1000, // 11.00 − 1.00
      calculated_yield_cents: 310_000, // 36,500,000 × 10 % × 31/365
      currency: 'MXN'
    });
    expect(p.json.data.reference_rate_id).toBeUndefined();

    const y1 = await confirmPeriod(admin, id, '2026-01-01', '2026-02-01');
    const stored = await env.DB.prepare('SELECT rate_bps, reference_rate_id, calculation_version FROM yield_entries WHERE id = ?').bind(y1.id).first<any>();
    expect(stored.rate_bps).toBe(1000);
    expect(stored.reference_rate_id).not.toBeNull();
    expect(stored.calculation_version).toContain('CETES_28@2025-12-30=1100-100');

    // Febrero usa la tasa del 15 de enero (10.50 − 1.00 = 9.50 %)
    const feb = await admin.call('POST', '/api/admin/yields/preview', { investment_id: id, period_start: '2026-02-01', period_end: '2026-03-01' });
    expect(feb.json.data.annual_rate_bps).toBe(950);

    // La tasa usada ya no se puede borrar; una no usada sí
    const rates = (await admin.call('GET', '/api/admin/reference-rates?rate_code=CETES_28')).json.data;
    const used = rates.find((r: any) => r.effective_date === '2025-12-30');
    const unused = rates.find((r: any) => r.effective_date === '2026-01-15');
    expect(used.in_use).toBe(true);
    expect((await admin.call('DELETE', `/api/admin/reference-rates/${used.id}`)).json.error.code).toBe('REFERENCE_RATE_IN_USE');
    expect((await admin.call('DELETE', `/api/admin/reference-rates/${unused.id}`)).status).toBe(200);
    // Duplicado y fecha futura
    expect((await addRate('2025-12-30', 1200)).json.error.code).toBe('REFERENCE_RATE_EXISTS');
    expect((await addRate('2099-01-01', 1200)).status).toBe(400);
  });

  it('CETES: solo en pesos; requiere plazo y diferencial; el inversionista ve la tasa vigente', async () => {
    const usd = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: investorId, code: 'FICT-CETES-USD', investment_type: 'CETES', currency: 'USD', reference_rate_code: 'CETES_28', spread_bps: -100,
      start_date: '2026-01-01', maturity_date: '2027-01-01', capital_cents: 100, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(usd.status).toBe(400);
    const noSpread = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: investorId, code: 'FICT-CETES-NS', investment_type: 'CETES', currency: 'MXN', reference_rate_code: 'CETES_28',
      start_date: '2026-01-01', maturity_date: '2027-01-01', capital_cents: 100, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(noSpread.status).toBe(400);

    const id = await cetes();
    await addRate('2026-01-01', 1100);
    const victoria = await login(env, 'victoria.perez@ficticio.test', INVESTOR_PASSWORD);
    const d = (await victoria.call('GET', `/api/investor/investments/${id}`)).json.data;
    expect(d.investment.terms).toMatchObject({ rate_type: 'REFERENCE', reference_rate_code: 'CETES_28', spread_bps: -100, fixed_annual_rate_bps: null });
    expect(d.current_reference_rate).toMatchObject({ rate_code: 'CETES_28', annual_rate_bps: 1100, applied_rate_bps: 1000 });
  });

  it('dólares: el resumen separa por moneda y nunca suma pesos con dólares', async () => {
    const mxn = await createInvestment(admin, investorId, { currency: 'MXN', capital_cents: 10_000_000 });
    const usd = await createInvestment(admin, investorId, { currency: 'USD', capital_cents: 5_000_000, investment_type: 'TRANSPORT' });
    await confirmPeriod(admin, mxn, '2026-01-15', '2026-02-15');
    const yUsd = await confirmPeriod(admin, usd, '2026-01-15', '2026-02-15');
    await admin.call('POST', '/api/admin/payments', {
      investment_id: usd, amount_cents: yUsd.amount, paid_at: '2026-02-16T12:00:00Z', reference: 'WIRE-USD-1', allocations: [{ yield_entry_id: yUsd.id, amount_cents: yUsd.amount }]
    });

    const victoria = await login(env, 'victoria.perez@ficticio.test', INVESTOR_PASSWORD);
    const s = (await victoria.call('GET', '/api/investor/summary')).json.data;
    expect(s.by_currency.map((b: any) => b.currency)).toEqual(['MXN', 'USD']);
    expect(s.by_currency[0].total_capital_cents).toBe(10_000_000);
    expect(s.by_currency[1]).toMatchObject({ total_capital_cents: 5_000_000, total_yield_paid_cents: yUsd.amount, total_yield_pending_cents: 0 });

    const list = (await victoria.call('GET', '/api/investor/investments')).json.data;
    expect(list.find((i: any) => i.id === usd).currency).toBe('USD');
    const adminSummary = (await admin.call('GET', '/api/admin/summary')).json.data;
    expect(adminSummary.by_currency).toHaveLength(2);
    const payments = (await admin.call('GET', `/api/admin/payments?investment_id=${usd}`)).json.data;
    expect(payments[0].currency).toBe('USD');
    // Moneda obligatoria y válida
    const bad = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: investorId, code: 'FICT-EUR', investment_type: 'MOBILITY', currency: 'EUR', fixed_annual_rate_bps: 1200,
      start_date: '2026-01-01', maturity_date: '2027-01-01', capital_cents: 100, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(bad.status).toBe(400);
  });

  it('modalidad anual: periodo de 12 meses anclado al inicio', async () => {
    const id = await createInvestment(admin, investorId, { payout_frequency: 'ANNUAL', start_date: '2026-01-01', maturity_date: '2028-01-01', capital_cents: 36_500_000, fixed_annual_rate_bps: 1000 });
    expect((await confirmPeriod(admin, id, '2026-01-01', '2027-01-01')).amount).toBe(3_650_000);
    const d = (await admin.call('GET', `/api/admin/investments/${id}`)).json.data;
    expect(d.investment.terms.payout_frequency).toBe('ANNUAL');
  });
});

describe('Vehículos eléctricos', () => {
  it('se registra como tipo de inversión con tasa fija', async () => {
    const env = makeEnv();
    await seedAdmin(env);
    const inv = await seedInvestor(env);
    const admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
    const id = await createInvestment(admin, inv, { investment_type: 'ELECTRIC_VEHICLES', fixed_annual_rate_bps: 1600 });
    const d = (await admin.call('GET', `/api/admin/investments/${id}`)).json.data;
    expect(d.investment.investment_type).toBe('ELECTRIC_VEHICLES');
    expect(d.investment.terms).toMatchObject({ rate_type: 'FIXED', fixed_annual_rate_bps: 1600 });
  });
});
