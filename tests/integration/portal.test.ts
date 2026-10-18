import { beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/worker/index';
import { ADMIN_PASSWORD, confirmPeriod, createInvestment, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor, type Client } from '../helpers/app';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]);

describe('Área del inversionista y administración', () => {
  let env: Env;
  let admin: Client;
  let hector: Client;
  let cesar: Client;
  let hectorId: string;
  let cesarId: string;

  beforeEach(async () => {
    env = makeEnv();
    await seedAdmin(env);
    hectorId = await seedInvestor(env, { email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
    cesarId = await seedInvestor(env, { email: 'cesar.daniel@ficticio.test', name: 'Cesar Daniel' });
    admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
    hector = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    cesar = await login(env, 'cesar.daniel@ficticio.test', INVESTOR_PASSWORD);
  });

  it('resumen, lista y detalle con saldo desglosado y ramo', async () => {
    const inv = await createInvestment(admin, hectorId, { investment_type: 'TRANSPORT', capital_cents: 40_000_000, fixed_annual_rate_bps: 2500 });
    const y = await confirmPeriod(admin, inv, '2026-01-15', '2026-02-15');
    await admin.call('POST', '/api/admin/payments', { investment_id: inv, amount_cents: 1000, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-1', allocations: [{ yield_entry_id: y.id, amount_cents: 1000 }] });

    const summary = (await hector.call('GET', '/api/investor/summary')).json.data;
    expect(summary.by_currency).toHaveLength(1);
    const s = summary.by_currency[0];
    expect(summary.active_investments_count).toBe(1);
    expect(summary.as_of_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s).toMatchObject({
      currency: 'MXN',
      total_capital_cents: 40_000_000,
      total_yield_confirmed_cents: y.amount,
      total_yield_paid_cents: 1000,
      total_yield_reinvested_cents: 0,
      total_yield_pending_cents: y.amount - 1000,
      active_investments_count: 1
    });

    const list = (await hector.call('GET', '/api/investor/investments?status=ACTIVE')).json;
    expect(list.pagination.total).toBe(1);
    expect(list.data[0]).toMatchObject({ investment_type: 'TRANSPORT', terms: { fixed_annual_rate_bps: 2500 }, stats: { yield_paid_cents: 1000 } });

    const detail = (await hector.call('GET', `/api/investor/investments/${inv}`)).json.data;
    expect(detail.investment.investment_type).toBe('TRANSPORT');
    expect(detail.investment.notes).toBeUndefined(); // notas internas solo para admin
    expect(detail.balance.yield_pending_cents).toBe(y.amount - 1000);
  });

  it('aislamiento por titular: otra persona recibe 404 en todo', async () => {
    const inv = await createInvestment(admin, hectorId);
    for (const path of [`/api/investor/investments/${inv}`, `/api/investor/investments/${inv}/history`, `/api/investor/investments/${inv}/series`]) {
      expect((await cesar.call('GET', path)).status).toBe(404);
    }
    expect((await cesar.call('GET', '/api/investor/investments')).json.data).toHaveLength(0);
  });

  it('historial unificado y paginado por tipo; la serie de la gráfica viene calculada', async () => {
    const inv = await createInvestment(admin, hectorId);
    const y1 = await confirmPeriod(admin, inv, '2026-01-15', '2026-02-15');
    await confirmPeriod(admin, inv, '2026-02-15', '2026-03-15');
    await admin.call('POST', '/api/admin/payments', { investment_id: inv, amount_cents: y1.amount, paid_at: '2026-02-16T03:00:00Z', reference: 'SPEI-H', allocations: [{ yield_entry_id: y1.id, amount_cents: y1.amount }] });

    const all = (await hector.call('GET', `/api/investor/investments/${inv}/history?pageSize=2`)).json;
    expect(all.pagination).toMatchObject({ total: 4, totalPages: 2, pageSize: 2 });
    const pays = (await hector.call('GET', `/api/investor/investments/${inv}/history?type=PAYMENTS`)).json.data;
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ entry_type: 'PAYMENT', reference: 'SPEI-H', effective_date: '2026-02-15' }); // fecha en CDMX
    const yields = (await hector.call('GET', `/api/investor/investments/${inv}/history?type=YIELDS`)).json.data;
    expect(yields.map((r: any) => r.pending_amount_cents)).toContain(0);

    const series = (await hector.call('GET', `/api/investor/investments/${inv}/series`)).json.data;
    expect(series.capital_points[0]).toEqual({ date: '2026-01-15', capital_cents: 25_000_000 });
    expect(series.yield_periods).toHaveLength(2);
    expect(series.yield_periods[0].paid_cents).toBe(y1.amount);
    expect(series.yield_periods[1].pending_cents).toBe(series.yield_periods[1].confirmed_cents);
  });

  it('el inversionista no tiene rutas de documentos; sus avisos no incluyen documentos', async () => {
    const inv = await createInvestment(admin, hectorId);
    expect((await hector.call('GET', `/api/investor/investments/${inv}/documents`)).status).toBe(404);
    expect((await hector.call('GET', '/api/investor/documents/doc_x/download')).status).toBe(404);
    const y = await confirmPeriod(admin, inv, '2026-01-15', '2026-02-15');
    await admin.call('POST', '/api/admin/payments', { investment_id: inv, amount_cents: 1, paid_at: '2026-02-16T12:00:00Z', reference: 'SPEI-N', allocations: [{ yield_entry_id: y.id, amount_cents: 1 }] });
    const notes = (await hector.call('GET', '/api/investor/notifications')).json.data;
    expect(notes.map((n: any) => n.event_type)).toEqual(['PAYMENT_RECORDED']);
    expect(notes[0].body_preview).toBeUndefined();
  });

  it('alta de cliente con beneficiarios (deben sumar 100 %) y detalle', async () => {
    const bad = await admin.call('POST', '/api/admin/investors', {
      email: 'victoria.perez@ficticio.test', password: 'Temporal2026', full_name: 'Victoria Pérez',
      beneficiaries: [{ full_name: 'Beneficiario FICTICIO', relationship: 'CHILD', percentage_bps: 7000 }]
    });
    expect(bad.json.error.code).toBe('INVALID_BENEFICIARIES');
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'victoria.perez@ficticio.test'").first<{ n: number }>())?.n).toBe(0);

    const ok = await admin.call('POST', '/api/admin/investors', {
      email: 'victoria.perez@ficticio.test', password: 'Temporal2026', full_name: 'Victoria Pérez', rfc: 'XAXX010101000',
      beneficiaries: [
        { full_name: 'Beneficiario FICTICIO Pérez', relationship: 'CHILD', percentage_bps: 5000 },
        { full_name: 'Beneficiaria FICTICIA Pérez', relationship: 'CHILD', percentage_bps: 5000 }
      ]
    });
    expect(ok.status).toBe(201);
    const detail = (await admin.call('GET', `/api/admin/investors/${ok.json.data.user_id}`)).json.data;
    expect(detail.beneficiaries).toHaveLength(2);
    expect(detail.beneficiaries[0]).toMatchObject({ relationship: 'CHILD', percentage_bps: 5000 });
    const dup = await admin.call('POST', '/api/admin/investors', { email: 'victoria.perez@ficticio.test', password: 'Temporal2026', full_name: 'Otra Persona' });
    expect(dup.json.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('alta de inversión: ramo obligatorio, validaciones y búsqueda', async () => {
    const noType = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: hectorId, code: 'FICT-NT', start_date: '2026-01-15', maturity_date: '2027-01-15', capital_cents: 100,
      fixed_annual_rate_bps: 1300, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(noType.status).toBe(400);
    const badDates = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: hectorId, code: 'FICT-BD', investment_type: 'FAST_FOOD', currency: 'MXN', start_date: '2026-02-30', maturity_date: '2027-01-15', capital_cents: 100,
      fixed_annual_rate_bps: 1300, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(badDates.status).toBe(400);
    const toAdmin = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: 'usr_admin', code: 'FICT-AD', investment_type: 'FAST_FOOD', currency: 'MXN', start_date: '2026-01-15', maturity_date: '2027-01-15', capital_cents: 100,
      fixed_annual_rate_bps: 1300, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(toAdmin.status).toBe(400);
    await createInvestment(admin, hectorId, { code: 'FICT-2026-001', investment_type: 'MOBILITY' });
    await createInvestment(admin, cesarId, { code: 'FICT-2026-004', investment_type: 'TRANSPORT' });
    const byName = (await admin.call('GET', '/api/admin/investments?q=cesar')).json;
    expect(byName.data).toHaveLength(1);
    expect(byName.data[0]).toMatchObject({ code: 'FICT-2026-004', investment_type: 'TRANSPORT', investor_name: 'Cesar Daniel' });
    const dupCode = await admin.call('POST', '/api/admin/investments', {
      investor_user_id: hectorId, code: 'fict-2026-001', investment_type: 'MOBILITY', currency: 'MXN', start_date: '2026-01-15', maturity_date: '2027-01-15', capital_cents: 100,
      fixed_annual_rate_bps: 1300, payout_frequency: 'MONTHLY', day_count_convention: 'ACT_365', capitalization_policy: 'NONE'
    });
    expect(dupCode.json.error.code).toBe('CODE_ALREADY_EXISTS');
    const investors = (await admin.call('GET', '/api/admin/investors?q=héctor')).json;
    expect(investors.data).toHaveLength(1);
  });

  it('documentos: solo admin, valida la firma real del archivo, descarga privada y archivado', async () => {
    const inv = await createInvestment(admin, hectorId);
    const form = (bytes: Uint8Array, name: string, type: string) => {
      const fd = new FormData();
      fd.set('file', new File([bytes], name, { type }));
      fd.set('title', 'Contrato FICTICIO');
      fd.set('document_type', 'CONTRACT');
      return fd;
    };
    const fake = await admin.call('POST', `/api/admin/investments/${inv}/documents`, form(new TextEncoder().encode('MZ ejecutable'), 'contrato.pdf', 'application/pdf'));
    expect(fake.status).toBe(415);
    const up = await admin.call('POST', `/api/admin/investments/${inv}/documents`, form(PDF, 'Contrato Señor.pdf', 'application/octet-stream'));
    expect(up.status).toBe(201);
    expect(up.json.data.content_type).toBe('application/pdf');
    const docId = up.json.data.id;

    expect((await hector.call('POST', `/api/admin/investments/${inv}/documents`, form(PDF, 'x.pdf', 'application/pdf'))).status).toBe(403);
    expect((await hector.call('GET', `/api/admin/documents/${docId}/download`)).status).toBe(403);

    const dl = await admin.call('GET', `/api/admin/documents/${docId}/download`);
    expect(dl.status).toBe(200);
    expect(dl.res.headers.get('cache-control')).toMatch(/no-store/);
    expect(dl.res.headers.get('content-disposition')).toContain("filename*=UTF-8''Contrato%20Se%C3%B1or.pdf");
    expect(new Uint8Array(await dl.res.arrayBuffer())).toEqual(PDF);

    expect((await admin.call('GET', `/api/admin/documents?investment_id=${inv}`)).json.data).toHaveLength(1);
    expect((await admin.call('DELETE', `/api/admin/documents/${docId}`)).status).toBe(200);
    expect((await admin.call('GET', `/api/admin/documents?investment_id=${inv}`)).json.data).toHaveLength(0);
    expect((await admin.call('GET', `/api/admin/documents/${docId}/download`)).status).toBe(404);
    // No se notifica al inversionista
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM notification_events WHERE event_type = 'DOCUMENT_UPLOADED'").first<{ n: number }>())?.n).toBe(0);
  });

  it('resumen de administración y rendimientos pendientes por inversión', async () => {
    const inv = await createInvestment(admin, hectorId);
    const y = await confirmPeriod(admin, inv, '2026-01-15', '2026-02-15');
    const summary = (await admin.call('GET', '/api/admin/summary')).json.data;
    expect(summary).toMatchObject({ investors_count: 2, active_investments_count: 1 });
    expect(summary.by_currency).toEqual([{ currency: 'MXN', total_capital_cents: 25_000_000, yield_pending_cents: y.amount, active_investments_count: 1 }]);
    const pending = (await admin.call('GET', `/api/admin/investments/${inv}/yields?pending=1`)).json.data;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: y.id, paid_cents: 0, reinvested_cents: 0, pending_cents: y.amount, source: 'AUTO' });
    const payments = (await admin.call('GET', `/api/admin/payments?investment_id=${inv}`)).json;
    expect(payments.data).toHaveLength(0);
  });
});
