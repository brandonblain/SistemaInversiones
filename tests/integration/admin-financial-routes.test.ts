import { describe, it, expect, beforeEach } from 'vitest';
import { app, Env } from '../../src/worker/index';
import { createTestD1Database, createTestR2Bucket } from '../helpers/d1-mock';
import { hashPassword } from '../../src/worker/services/crypto';
import { getCapitalLedgerSummary, recordCapitalMovement } from '../../src/worker/services/capital-ledger';

describe('Admin Financial Endpoints & Capital Ledger Suite', () => {
  let env: Env;
  let adminToken: string;
  let invUserId: string;
  let investmentId: string;

  beforeEach(async () => {
    const db = createTestD1Database();
    const bucket = createTestR2Bucket();
    env = {
      DB: db,
      DOCS_BUCKET: bucket,
      ENVIRONMENT: 'test',
      APP_BASE_URL: 'http://localhost:8787',
      DEFAULT_CURRENCY: 'MXN',
      EMAIL_FROM: 'avisos@portal-inversionistas.privado'
    };

    const adminHash = await hashPassword('AdminPass123!');
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, is_active) VALUES ('u_adm', 'admin@finance.test', ?, 'ADMIN', 1)"
    ).bind(adminHash).run();

    const admLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@finance.test', password: 'AdminPass123!' })
    }, env);
    const admData = await admLogin.json() as { data: { token: string } };
    adminToken = admData.data.token;

    // Crear Inversionista
    const createInv = await app.request('/api/admin/investors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: 'client@finance.test',
        password: 'ClientPass123!',
        full_name: 'Guillermo del Toro',
        rfc: 'DELG700101ABC'
      })
    }, env);
    const invData = await createInv.json() as { data: { user_id: string } };
    invUserId = invData.data.user_id;

    // Crear Inversión con política COMPOUND_TO_CAPITAL
    const createInvRes = await app.request('/api/admin/investments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        investor_user_id: invUserId,
        code: 'INV-GDT-001',
        start_date: '2026-01-01',
        maturity_date: '2027-01-01',
        capital_cents: 100000000, // $1,000,000.00 MXN
        fixed_annual_rate_bps: 1200, // 12%
        payout_frequency: 'MONTHLY',
        day_count_convention: 'ACT_365',
        capitalization_policy: 'COMPOUND_TO_CAPITAL'
      })
    }, env);
    const resData = await createInvRes.json() as { data: { investment_id: string } };
    investmentId = resData.data.investment_id;
  });

  it('should test capital ledger movements and summary directly', async () => {
    // 1. Aportación de capital
    await recordCapitalMovement(env.DB, {
      investmentId,
      movementType: 'CAPITAL_CONTRIBUTION',
      amountCents: 50000000, // $500,000
      effectiveDate: '2026-01-15',
      notes: 'Segunda aportación',
      recordedByUserId: 'u_adm'
    });

    let summary = await getCapitalLedgerSummary(env.DB, investmentId);
    expect(summary.currentCapitalCents).toBe(150000000);
    expect(summary.totalContributedCents).toBe(150000000);

    // 2. Retiro parcial de capital
    await recordCapitalMovement(env.DB, {
      investmentId,
      movementType: 'CAPITAL_WITHDRAWAL',
      amountCents: 20000000, // $200,000
      effectiveDate: '2026-01-20',
      notes: 'Retiro parcial',
      recordedByUserId: 'u_adm'
    });

    summary = await getCapitalLedgerSummary(env.DB, investmentId);
    expect(summary.currentCapitalCents).toBe(130000000);
    expect(summary.totalWithdrawnCents).toBe(20000000);

    // 3. Intento de retiro superior al capital (debe fallar)
    await expect(
      recordCapitalMovement(env.DB, {
        investmentId,
        movementType: 'CAPITAL_WITHDRAWAL',
        amountCents: 200000000,
        effectiveDate: '2026-01-25',
        recordedByUserId: 'u_adm'
      })
    ).rejects.toThrow(/Capital insuficiente/);
  });

  it('should test admin financial workflow via HTTP: preview, confirm, payment, reinvest, and reverse', async () => {
    // 1. Preview
    const previewRes = await app.request('/api/admin/yields/preview', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        investment_id: investmentId,
        period_start: '2026-01-01',
        period_end: '2026-02-01'
      })
    }, env);
    expect(previewRes.status).toBe(200);
    const previewJson = await previewRes.json() as { data: { yieldCents: number; daysCount: number } };
    expect(previewJson.data.yieldCents).toBeGreaterThan(0);
    expect(previewJson.data.daysCount).toBe(31);

    // 2. Confirm yield
    const confirmRes = await app.request('/api/admin/yields/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        investment_id: investmentId,
        period_start: '2026-01-01',
        period_end: '2026-02-01'
      })
    }, env);
    expect(confirmRes.status).toBe(200);
    const confirmJson = await confirmRes.json() as { data: { yield_entry_id: string; amount_cents: number } };
    const yieldId = confirmJson.data.yield_entry_id;

    // 3. Manual yield
    const manualRes = await app.request('/api/admin/yields/manual', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        investment_id: investmentId,
        period_start: '2026-02-01',
        period_end: '2026-03-01',
        amount_cents: 100000,
        reason: 'Ajuste contractual extraordinario'
      })
    }, env);
    expect(manualRes.status).toBe(200);
    const manualJson = await manualRes.json() as { data: { yield_entry_id: string } };
    const manualYieldId = manualJson.data.yield_entry_id;

    // 4. Reverse manual yield
    const reverseRes = await app.request(`/api/admin/yields/${manualYieldId}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Cancelación de bono extraordinario por mutuo acuerdo' })
    }, env);
    expect(reverseRes.status).toBe(200);

    // 5. Reinvest confirmed yield
    const reinvestRes = await app.request(`/api/admin/investments/${investmentId}/reinvest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        yield_entry_id: yieldId,
        effective_date: '2026-02-01'
      })
    }, env);
    expect(reinvestRes.status).toBe(200);
    const reinvestJson = await reinvestRes.json() as { data: { newCapitalCents: number } };
    expect(reinvestJson.data.newCapitalCents).toBe(100000000 + confirmJson.data.amount_cents);

    // 6. Test audit logs endpoint
    const auditRes = await app.request('/api/admin/audit-logs?page=1&pageSize=10', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` }
    }, env);
    expect(auditRes.status).toBe(200);
    const auditJson = await auditRes.json() as { data: Array<{ action: string }>; pagination: { total: number } };
    expect(auditJson.data.length).toBeGreaterThan(0);
    expect(auditJson.pagination.total).toBeGreaterThan(0);

    // 7. Test manual scheduled job endpoint
    const maintenanceRes = await app.request('/api/admin/jobs/run-maintenance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    }, env);
    expect(maintenanceRes.status).toBe(200);
    const maintenanceJson = await maintenanceRes.json() as { data: { status: string } };
    expect(maintenanceJson.data.status).toBe('SUCCESS');
  });
});
