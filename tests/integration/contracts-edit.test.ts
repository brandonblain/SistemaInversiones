import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/worker/index';
import { ADMIN_PASSWORD, confirmPeriod, createInvestment, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

describe('Contratos: edición y archivo ("Eliminar")', () => {
  let env: Env;
  let admin: Client;
  let investorId: string;

  beforeEach(async () => {
    env = makeEnv();
    await seedAdmin(env);
    investorId = await seedInvestor(env, { email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
  });

  const full = (overrides: Record<string, unknown> = {}) => ({
    investor_user_id: investorId,
    code: 'FICT-EDIT-1',
    investment_type: 'ELECTRIC_MOBILITY',
    currency: 'MXN',
    status: 'ACTIVE',
    start_date: '2026-01-15',
    maturity_date: '2027-01-15',
    capital_cents: 25_000_000,
    fixed_annual_rate_bps: 1600,
    payout_frequency: 'MONTHLY',
    day_count_convention: 'ACT_365',
    capitalization_policy: 'NONE',
    ...overrides
  });
  const preview = async (id: string, start: string, end: string) =>
    (await admin.call('POST', '/api/admin/yields/preview', { investment_id: id, period_start: start, period_end: end })).json.data;

  it('edita todos los campos; un cambio de capital se refleja en los rendimientos siguientes', async () => {
    const id = await createInvestment(admin, investorId, { code: 'FICT-EDIT-1' });
    const r = await admin.call('PATCH', `/api/admin/investments/${id}`, full({ code: 'fict-edit-2', investment_type: 'MECHANIC_LIFTS', capital_cents: 30_000_000, fixed_annual_rate_bps: 1800, payout_frequency: 'SEMIANNUAL', notes: 'Corregido' }));
    expect(r.status).toBe(200);
    const d = (await admin.call('GET', `/api/admin/investments/${id}`)).json.data.investment;
    expect(d).toMatchObject({ code: 'FICT-EDIT-2', investment_type: 'MECHANIC_LIFTS', initial_capital_cents: 30_000_000, current_capital_cents: 30_000_000, notes: 'Corregido' });
    expect(d.terms).toMatchObject({ fixed_annual_rate_bps: 1800, payout_frequency: 'SEMIANNUAL' });
    const p = await preview(id, '2026-01-15', '2026-02-15');
    expect(p.capital_cents).toBe(30_000_000);
    expect(p.annual_rate_bps).toBe(1800);
    // Bitácora con valores anteriores y nuevos
    const log = (await admin.call('GET', '/api/admin/audit-logs?action=INVESTMENT_UPDATED')).json.data[0];
    expect(JSON.parse(log.old_values_json)).toMatchObject({ code: 'FICT-EDIT-1', capital_cents: 25_000_000 });
    expect(JSON.parse(log.new_values_json)).toMatchObject({ code: 'FICT-EDIT-2', capital_cents: 30_000_000, capital_adjustments: 1 });
  });

  it('mover la fecha de inicio traslada el capital a la nueva fecha; estado y CETES se validan', async () => {
    const id = await createInvestment(admin, investorId);
    expect((await admin.call('PATCH', `/api/admin/investments/${id}`, full({ start_date: '2026-03-01', status: 'MATURED' }))).status).toBe(200);
    expect((await preview(id, '2026-03-01', '2026-04-01')).capital_cents).toBe(25_000_000);
    const d = (await admin.call('GET', `/api/admin/investments/${id}`)).json.data.investment;
    expect(d).toMatchObject({ start_date: '2026-03-01', status: 'MATURED', current_capital_cents: 25_000_000 });
    // CETES solo en pesos; estado del catálogo
    expect((await admin.call('PATCH', `/api/admin/investments/${id}`, full({ investment_type: 'CETES', currency: 'USD', reference_rate_code: 'CETES_28', spread_bps: -100 }))).status).toBe(400);
    expect((await admin.call('PATCH', `/api/admin/investments/${id}`, full({ status: 'BORRADO' }))).status).toBe(400);
  });

  it('el capital confirmado no se recalcula y el vigente no puede quedar negativo', async () => {
    const id = await createInvestment(admin, investorId);
    const y = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    expect((await admin.call('PATCH', `/api/admin/investments/${id}`, full({ capital_cents: 10_000_000 }))).status).toBe(200);
    const yields = (await admin.call('GET', `/api/admin/investments/${id}/yields`)).json.data;
    expect(yields.find((e: any) => e.id === y.id).amount_cents).toBe(y.amount);
    // Simula retiros ya registrados: vigente 5,000,000 con inicial 10,000,000
    await env.DB.prepare('UPDATE investments SET current_capital_cents = 5000000 WHERE id = ?').bind(id).run();
    expect((await admin.call('PATCH', `/api/admin/investments/${id}`, full({ capital_cents: 1_000_000 }))).json.error.code).toBe('INVALID_INPUT');
  });

  it('un contrato con giro retirado puede conservarlo, pero no se puede asignar a otro', async () => {
    const id = await createInvestment(admin, investorId, { code: 'FICT-HIST' });
    const other = await createInvestment(admin, investorId, { code: 'FICT-OTRO' });
    await env.DB.prepare("UPDATE investments SET business_line = 'FOREIGN_VEHICLES', investment_type = 'TRANSPORT' WHERE id = ?").bind(id).run();
    expect((await admin.call('PATCH', `/api/admin/investments/${id}`, full({ code: 'FICT-HIST', investment_type: 'FOREIGN_VEHICLES', notes: 'Sigue igual' }))).status).toBe(200);
    expect((await admin.call('PATCH', `/api/admin/investments/${other}`, full({ code: 'FICT-OTRO', investment_type: 'FOREIGN_VEHICLES' }))).status).toBe(400);
    expect((await admin.call('PATCH', `/api/admin/investments/${other}`, full({ code: 'FICT-HIST' }))).json.error.code).toBe('CODE_ALREADY_EXISTS');
  });

  it('archivar oculta el contrato en todo el portal y restaurarlo lo devuelve', async () => {
    const id = await createInvestment(admin, investorId, { code: 'FICT-ARCH' });
    const hector = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    expect((await admin.call('DELETE', `/api/admin/investments/${id}`)).status).toBe(200);
    expect((await admin.call('DELETE', `/api/admin/investments/${id}`)).json.error.code).toBe('ALREADY_ARCHIVED');

    expect((await admin.call('GET', '/api/admin/investments')).json.data).toHaveLength(0);
    expect((await admin.call('GET', '/api/admin/investments?archived=1')).json.data.map((r: any) => r.code)).toEqual(['FICT-ARCH']);
    expect((await admin.call('GET', '/api/admin/summary')).json.data.active_investments_count).toBe(0);
    expect((await admin.call('GET', '/api/admin/statistics')).json.data.by_type).toEqual([]);
    expect((await admin.call('GET', `/api/admin/investments/${id}`)).json.data.investment.archived_at).toBeTruthy();
    expect((await hector.call('GET', '/api/investor/investments')).json.data).toHaveLength(0);
    expect((await hector.call('GET', `/api/investor/investments/${id}`)).status).toBe(404);
    expect((await hector.call('GET', '/api/investor/summary')).json.data.active_investments_count).toBe(0);

    expect((await admin.call('POST', `/api/admin/investments/${id}/restore`)).status).toBe(200);
    expect((await admin.call('GET', '/api/admin/investments')).json.data.map((r: any) => r.code)).toEqual(['FICT-ARCH']);
    expect((await hector.call('GET', `/api/investor/investments/${id}`)).status).toBe(200);
    const actions = (await admin.call('GET', '/api/admin/audit-logs')).json.data.map((l: any) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['INVESTMENT_ARCHIVED', 'INVESTMENT_RESTORED']));
  });

  it('solo el administrador edita o elimina; el cliente únicamente consulta su contrato', async () => {
    const id = await createInvestment(admin, investorId, { code: 'FICT-SOLO-ADMIN' });
    const hector = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    for (const [method, path, body] of [
      ['PATCH', `/api/admin/investments/${id}`, full({ code: 'FICT-HACK' })],
      ['DELETE', `/api/admin/investments/${id}`, undefined],
      ['POST', `/api/admin/investments/${id}/restore`, undefined],
      ['PATCH', `/api/investor/investments/${id}`, full({ code: 'FICT-HACK' })],
      ['DELETE', `/api/investor/investments/${id}`, undefined]
    ] as const) {
      expect([403, 404, 405]).toContain((await hector.call(method, path, body)).status);
    }
    const d = (await hector.call('GET', `/api/investor/investments/${id}`)).json.data;
    expect(d.investment?.code ?? d.code).toBe('FICT-SOLO-ADMIN');
  });
});
