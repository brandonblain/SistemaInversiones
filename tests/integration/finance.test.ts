import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/worker/index';
import { ADMIN_PASSWORD, confirmPeriod, createInvestment, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

describe('Motor financiero vía API', () => {
  let env: Env;
  let admin: Client;
  let investorId: string;

  beforeEach(async () => {
    env = makeEnv();
    await seedAdmin(env);
    investorId = await seedInvestor(env, { email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
  });

  const summaryOf = async (id: string) => (await admin.call('GET', `/api/admin/investments/${id}`)).json.data.balance;

  it('mensual, semestral y al vencimiento con la misma tasa anual (interés simple ACT/365)', async () => {
    const m = await createInvestment(admin, investorId, { payout_frequency: 'MONTHLY', start_date: '2026-01-01', maturity_date: '2027-01-01', capital_cents: 36_500_000, fixed_annual_rate_bps: 1000 });
    const s = await createInvestment(admin, investorId, { payout_frequency: 'SEMIANNUAL', start_date: '2026-01-01', maturity_date: '2027-01-01', capital_cents: 36_500_000, fixed_annual_rate_bps: 1000 });
    const v = await createInvestment(admin, investorId, { payout_frequency: 'AT_MATURITY', start_date: '2026-01-01', maturity_date: '2027-01-01', capital_cents: 36_500_000, fixed_annual_rate_bps: 1000 });
    // 36,500,000 × 10 % × d/365 = 10,000 × d centavos
    expect((await confirmPeriod(admin, m, '2026-01-01', '2026-02-01')).amount).toBe(310_000);
    expect((await confirmPeriod(admin, s, '2026-01-01', '2026-07-01')).amount).toBe(1_810_000);
    expect((await confirmPeriod(admin, v, '2026-01-01', '2027-01-01')).amount).toBe(3_650_000);
  });

  it('doble clic / reintento: confirmar el mismo periodo no duplica (secuencial y simultáneo)', async () => {
    const id = await createInvestment(admin, investorId);
    const p = await admin.call('POST', '/api/admin/yields/preview', { investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15' });
    const body = { investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15', amount_cents: p.json.data.calculated_yield_cents };
    const [a, b] = await Promise.all([admin.call('POST', '/api/admin/yields/confirm', body), admin.call('POST', '/api/admin/yields/confirm', body)]);
    const c = await admin.call('POST', '/api/admin/yields/confirm', body);
    expect([a.status, b.status, c.status].filter((s) => s === 201)).toHaveLength(1);
    expect(new Set([a.json.data.yield_entry_id, b.json.data.yield_entry_id, c.json.data.yield_entry_id]).size).toBe(1);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM yield_entries WHERE investment_id = ?').bind(id).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('rechaza periodos traslapados, fuera del contrato y vistas previas desactualizadas', async () => {
    const id = await createInvestment(admin, investorId);
    await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    const overlap = await admin.call('POST', '/api/admin/yields/confirm', { investment_id: id, period_start: '2026-02-01', period_end: '2026-03-01' });
    expect(overlap.json.error.code).toBe('YIELD_PERIOD_OVERLAP');
    const outside = await admin.call('POST', '/api/admin/yields/preview', { investment_id: id, period_start: '2026-01-01', period_end: '2026-02-01' });
    expect(outside.json.error.code).toBe('PERIOD_OUTSIDE_CONTRACT');
    const stale = await admin.call('POST', '/api/admin/yields/confirm', { investment_id: id, period_start: '2026-02-15', period_end: '2026-03-15', amount_cents: 1 });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('PREVIEW_MISMATCH');
  });

  it('en producción no se confirman rendimientos sin convenciones aprobadas', async () => {
    const prod = { ...env, ENVIRONMENT: 'production', REQUIRE_ADMIN_MFA: 'false' };
    const id = await createInvestment(admin, investorId);
    const { app } = await import('../../src/worker/index');
    const res = await app.request('/api/admin/yields/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
      body: JSON.stringify({ investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15' })
    }, prod);
    // En producción el MFA es obligatorio aunque REQUIRE_ADMIN_MFA diga "false"
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe('MFA_SETUP_REQUIRED');
    await env.DB.prepare("UPDATE users SET mfa_enabled = 1 WHERE role = 'ADMIN'").run();
    const res2 = await app.request('/api/admin/yields/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
      body: JSON.stringify({ investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15' })
    }, prod);
    expect(res2.status).toBe(423);
    const approved = await app.request('/api/admin/yields/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: admin.cookie },
      body: JSON.stringify({ investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15' })
    }, { ...prod, FINANCIAL_RULES_APPROVED: 'true' });
    expect(approved.status).toBe(201);
  });

  it('pago parcial, pago completo, saldo pendiente y pago no realizado', async () => {
    const id = await createInvestment(admin, investorId);
    const y = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    expect((await summaryOf(id)).yield_pending_cents).toBe(y.amount);

    const part = Math.floor(y.amount / 2);
    const p1 = await admin.call('POST', '/api/admin/payments', {
      investment_id: id, amount_cents: part, paid_at: '2026-02-16T12:00:00-06:00', reference: 'SPEI-FICT-1',
      allocations: [{ yield_entry_id: y.id, amount_cents: part }]
    });
    expect(p1.status).toBe(201);
    let b = await summaryOf(id);
    expect(b.yield_paid_cents).toBe(part);
    expect(b.yield_pending_cents).toBe(y.amount - part);

    const p2 = await admin.call('POST', '/api/admin/payments', {
      investment_id: id, amount_cents: y.amount - part, paid_at: '2026-02-17T12:00:00-06:00', reference: 'SPEI-FICT-2',
      allocations: [{ yield_entry_id: y.id, amount_cents: y.amount - part }]
    });
    expect(p2.status).toBe(201);
    b = await summaryOf(id);
    expect(b.yield_pending_cents).toBe(0);
    expect(b.yield_paid_cents + b.yield_reinvested_cents + b.yield_pending_cents).toBe(b.yield_confirmed_cents);

    // Un aviso no es un pago: encolar notificaciones no cambia saldos
    const before = await summaryOf(id);
    await env.DB.prepare("INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview) VALUES ('n-x', ?, 'PAYMENT_RECORDED', 'x@ficticio.test', 'Aviso', 'Aviso')").bind(investorId).run();
    expect(await summaryOf(id)).toEqual(before);
  });

  it('asignaciones inválidas: exceder saldo, exceder pago, referencia duplicada, pago futuro', async () => {
    const id = await createInvestment(admin, investorId);
    const y = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    const over = await admin.call('POST', '/api/admin/payments', {
      investment_id: id, amount_cents: y.amount + 100, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-FICT-X',
      allocations: [{ yield_entry_id: y.id, amount_cents: y.amount + 1 }]
    });
    expect(over.json.error.code).toBe('ALLOCATION_EXCEEDS_PENDING');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM payment_records').first<{ n: number }>())?.n).toBe(0);

    const tooMuch = await admin.call('POST', '/api/admin/payments', {
      investment_id: id, amount_cents: 100, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-FICT-Y',
      allocations: [{ yield_entry_id: y.id, amount_cents: 200 }]
    });
    expect(tooMuch.json.error.code).toBe('ALLOCATION_EXCEEDS_PAYMENT');

    const ok = { investment_id: id, amount_cents: 100, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-FICT-Z', allocations: [{ yield_entry_id: y.id, amount_cents: 100 }] };
    const [r1, r2] = await Promise.all([admin.call('POST', '/api/admin/payments', ok), admin.call('POST', '/api/admin/payments', ok)]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);

    const future = await admin.call('POST', '/api/admin/payments', { ...ok, reference: 'SPEI-FUTURO', paid_at: '2099-01-01T12:00:00Z' });
    expect(future.json.error.code).toBe('PAYMENT_IN_FUTURE');
    const floatAmount = await admin.call('POST', '/api/admin/payments', { ...ok, reference: 'SPEI-FLOAT', amount_cents: 10.5 });
    expect(floatAmount.status).toBe(400);
  });

  it('pagos simultáneos no pueden sobre-asignar la misma partida', async () => {
    const id = await createInvestment(admin, investorId);
    const y = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    const pay = (ref: string) => admin.call('POST', '/api/admin/payments', {
      investment_id: id, amount_cents: y.amount, paid_at: '2026-02-16T12:00:00Z', reference: ref, allocations: [{ yield_entry_id: y.id, amount_cents: y.amount }]
    });
    const results = await Promise.all([pay('SPEI-A'), pay('SPEI-B'), pay('SPEI-C')]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await summaryOf(id)).yield_paid_cents).toBe(y.amount);
  });

  it('reversión con contra-asiento; no se reversa lo pagado ni dos veces', async () => {
    const id = await createInvestment(admin, investorId);
    const y1 = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    const rev = await admin.call('POST', `/api/admin/yields/${y1.id}/reverse`, { reason: 'Error de captura FICTICIO' });
    expect(rev.status).toBe(201);
    expect((await summaryOf(id)).yield_confirmed_cents).toBe(0);
    expect((await admin.call('POST', `/api/admin/yields/${y1.id}/reverse`, { reason: 'Otra vez FICTICIO' })).json.error.code).toBe('ALREADY_REVERSED');
    // El original sigue existiendo (no se destruye)
    const rows = await env.DB.prepare('SELECT status, source, amount_cents FROM yield_entries WHERE investment_id = ? ORDER BY created_at').bind(id).all();
    expect(rows.results).toHaveLength(2);
    // Tras reversar, el periodo puede confirmarse de nuevo
    const y2 = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    await admin.call('POST', '/api/admin/payments', { investment_id: id, amount_cents: 100, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-R', allocations: [{ yield_entry_id: y2.id, amount_cents: 100 }] });
    expect((await admin.call('POST', `/api/admin/yields/${y2.id}/reverse`, { reason: 'Intento FICTICIO' })).json.error.code).toBe('YIELD_HAS_SETTLEMENTS');
  });

  it('ajustes manuales con motivo pueden coexistir con el devengo del mismo periodo', async () => {
    const id = await createInvestment(admin, investorId);
    const y = await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    const adj = await admin.call('POST', '/api/admin/yields/manual', { investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15', amount_cents: -1000, reason: 'Ajuste por redondeo FICTICIO' });
    expect(adj.status).toBe(201);
    expect((await summaryOf(id)).yield_confirmed_cents).toBe(y.amount - 1000);
    const noReason = await admin.call('POST', '/api/admin/yields/manual', { investment_id: id, period_start: '2026-01-15', period_end: '2026-02-15', amount_cents: 500, reason: 'x' });
    expect(noReason.status).toBe(400);
  });

  it('capitalización: permitida vs no permitida; el capital nuevo se usa desde su fecha efectiva', async () => {
    const no = await createInvestment(admin, investorId, { capitalization_policy: 'NONE' });
    const yNo = await confirmPeriod(admin, no, '2026-01-15', '2026-02-15');
    expect((await admin.call('POST', `/api/admin/investments/${no}/reinvest`, { yield_entry_id: yNo.id, effective_date: '2026-02-15' })).json.error.code).toBe('REINVEST_NOT_ALLOWED');

    const yes = await createInvestment(admin, investorId, { capitalization_policy: 'COMPOUND_TO_CAPITAL', capital_cents: 40_000_000, fixed_annual_rate_bps: 2500, payout_frequency: 'SEMIANNUAL', start_date: '2025-11-01', maturity_date: '2027-05-01' });
    const s1 = await confirmPeriod(admin, yes, '2025-11-01', '2026-05-01');
    const re = await admin.call('POST', `/api/admin/investments/${yes}/reinvest`, { yield_entry_id: s1.id, effective_date: '2026-05-01' });
    expect(re.status).toBe(201);
    expect(re.json.data.new_capital_cents).toBe(40_000_000 + s1.amount);
    // No se puede pagar ni reinvertir de nuevo la partida reinvertida
    expect((await admin.call('POST', `/api/admin/investments/${yes}/reinvest`, { yield_entry_id: s1.id, effective_date: '2026-05-01' })).status).toBe(409);
    const pay = await admin.call('POST', '/api/admin/payments', { investment_id: yes, amount_cents: 100, paid_at: '2026-05-02T12:00:00Z', reference: 'SPEI-RI', allocations: [{ yield_entry_id: s1.id, amount_cents: 100 }] });
    expect(pay.json.error.code).toBe('ALLOCATION_EXCEEDS_PENDING');

    // El periodo anterior usa el capital viejo; el siguiente, el capital con reinversión
    const before = await admin.call('POST', '/api/admin/yields/preview', { investment_id: yes, period_start: '2025-11-01', period_end: '2026-05-01' });
    expect(before.json.data.capital_cents).toBe(40_000_000);
    const after = await admin.call('POST', '/api/admin/yields/preview', { investment_id: yes, period_start: '2026-05-01', period_end: '2026-11-01' });
    expect(after.json.data.capital_cents).toBe(40_000_000 + s1.amount);
    // Un periodo que cruza el cambio de capital debe dividirse
    const cross = await admin.call('POST', '/api/admin/yields/preview', { investment_id: yes, period_start: '2026-04-01', period_end: '2026-06-01' });
    expect(cross.json.error.code).toBe('PERIOD_CROSSES_CAPITAL_CHANGE');
    expect(cross.json.error.details.split_at).toBe('2026-05-01');
  });

  it('dos inversiones del mismo cliente con modalidades distintas se calculan por separado', async () => {
    const a = await createInvestment(admin, investorId, { payout_frequency: 'MONTHLY', investment_type: 'ELECTRIC_MOBILITY' });
    const b = await createInvestment(admin, investorId, { payout_frequency: 'AT_MATURITY', investment_type: 'FOOD_TRUCKS', capital_cents: 10_000_000, fixed_annual_rate_bps: 1300 });
    await confirmPeriod(admin, a, '2026-01-15', '2026-02-15');
    expect((await summaryOf(b)).yield_confirmed_cents).toBe(0);
    expect((await summaryOf(a)).yield_confirmed_cents).toBeGreaterThan(0);
  });

  it('la bitácora registra cada operación financiera', async () => {
    const id = await createInvestment(admin, investorId);
    await confirmPeriod(admin, id, '2026-01-15', '2026-02-15');
    const logs = await admin.call('GET', '/api/admin/audit-logs?action=yield');
    expect(logs.json.data.some((l: any) => l.action === 'YIELD_CONFIRMED')).toBe(true);
    const created = await admin.call('GET', '/api/admin/audit-logs?action=INVESTMENT_CREATED');
    expect(created.json.pagination.total).toBe(1);
  });
});
