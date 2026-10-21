import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/worker/index';
import { todayInContractZone, addDays } from '../../src/worker/lib/dates';
import { ADMIN_PASSWORD, confirmPeriod, createInvestment, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

describe('Estadísticas de administración', () => {
  let env: Env;
  let admin: Client;
  let hector: string;
  let cesar: string;

  beforeEach(async () => {
    env = makeEnv();
    await seedAdmin(env);
    hector = await seedInvestor(env, { email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
    cesar = await seedInvestor(env, { email: 'cesar.daniel@ficticio.test', name: 'Cesar Daniel' });
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
  });

  it('generales: totales por moneda, distribución por ramo y modalidad, tasa ponderada, por cliente', async () => {
    // Héctor: 2 en MXN (1,000,000 al 10 % y 3,000,000 al 20 %); Cesar: 1 en USD
    const a = await createInvestment(admin, hector, { capital_cents: 100_000_000, fixed_annual_rate_bps: 1000, investment_type: 'ELECTRIC_MOBILITY' });
    await createInvestment(admin, hector, { capital_cents: 300_000_000, fixed_annual_rate_bps: 2000, investment_type: 'FOREIGN_VEHICLES', payout_frequency: 'ANNUAL' });
    const usd = await createInvestment(admin, cesar, { currency: 'USD', capital_cents: 2_000_000, fixed_annual_rate_bps: 1200, investment_type: 'FOREIGN_VEHICLES' });
    const ya = await confirmPeriod(admin, a, '2026-01-15', '2026-02-15');
    await admin.call('POST', '/api/admin/payments', { investment_id: a, amount_cents: 1000, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-ST-1', allocations: [{ yield_entry_id: ya.id, amount_cents: 1000 }] });
    await confirmPeriod(admin, usd, '2026-01-15', '2026-02-15');

    const s = (await admin.call('GET', '/api/admin/statistics')).json.data;
    expect(s.totals.map((t: any) => t.currency)).toEqual(['MXN', 'USD']);
    const mxn = s.totals[0];
    expect(mxn).toMatchObject({
      investors_count: 1, investments_active: 2, capital_cents: 400_000_000,
      yield_confirmed_cents: ya.amount, yield_paid_cents: 1000, yield_pending_cents: ya.amount - 1000,
      // (1,000,000×10 % + 3,000,000×20 %) / 4,000,000 = 17.50 %
      weighted_fixed_rate_bps: 1750
    });
    expect(s.totals[1]).toMatchObject({ currency: 'USD', investors_count: 1, capital_cents: 2_000_000 });

    expect(s.by_type.filter((t: any) => t.currency === 'MXN').map((t: any) => t.investment_type)).toEqual(['FOREIGN_VEHICLES', 'ELECTRIC_MOBILITY']);
    expect(s.by_payout.find((p: any) => p.payout_frequency === 'ANNUAL').capital_cents).toBe(300_000_000);

    const febMxn = s.monthly.find((m: any) => m.currency === 'MXN' && m.month === '2026-02');
    expect(febMxn).toMatchObject({ yield_confirmed_cents: ya.amount, paid_cents: 1000 });
    expect(s.monthly.filter((m: any) => m.currency === 'MXN')).toHaveLength(12);

    expect(s.investors).toHaveLength(2);
    expect(s.investors[0]).toMatchObject({ full_name: 'Héctor Galeana', currency: 'MXN', investments_count: 2, active_count: 2 });
  });

  it('por cliente (?investor_id=) y vencimientos próximos', async () => {
    const today = todayInContractZone();
    await createInvestment(admin, hector, { start_date: addDays(today, -300), maturity_date: addDays(today, 20), code: 'FICT-VENCE' });
    await createInvestment(admin, cesar, { capital_cents: 999 });
    const s = (await admin.call('GET', `/api/admin/statistics?investor_id=${hector}`)).json.data;
    expect(s.investors).toHaveLength(1);
    expect(s.totals[0].capital_cents).toBe(25_000_000);
    expect(s.upcoming_maturities.map((u: any) => u.code)).toEqual(['FICT-VENCE']);
    expect((await admin.call('GET', '/api/admin/statistics?investor_id=no-existe')).status).toBe(404);
  });

  it('la lista de inversiones trae saldos y filtra por moneda, ramo y cliente; solo admin', async () => {
    const a = await createInvestment(admin, hector);
    await createInvestment(admin, cesar, { currency: 'USD', investment_type: 'FOREIGN_VEHICLES' });
    const y = await confirmPeriod(admin, a, '2026-01-15', '2026-02-15');
    const all = (await admin.call('GET', '/api/admin/investments')).json.data;
    expect(all.find((r: any) => r.id === a)).toMatchObject({ yield_confirmed_cents: y.amount, yield_pending_cents: y.amount, yield_paid_cents: 0 });
    expect((await admin.call('GET', '/api/admin/investments?currency=USD')).json.data).toHaveLength(1);
    expect((await admin.call('GET', '/api/admin/investments?investment_type=ELECTRIC_MOBILITY')).json.data).toHaveLength(1);
    expect((await admin.call('GET', `/api/admin/investments?investor_id=${cesar}`)).json.data).toHaveLength(1);
    const inv = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    expect((await inv.call('GET', '/api/admin/statistics')).status).toBe(403);
  });
});
