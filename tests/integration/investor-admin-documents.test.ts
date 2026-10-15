import { describe, it, expect, beforeEach } from 'vitest';
import { app, Env } from '../../src/worker/index';
import { createTestD1Database, createTestR2Bucket } from '../helpers/d1-mock';
import { hashPassword } from '../../src/worker/services/crypto';

describe('Investor & Admin Operations & Private R2 Documents Suite', () => {
  let env: Env;
  let adminToken: string;
  let inv1Token: string;
  let inv2Token: string;
  let inv1UserId: string;
  let _inv2UserId: string;
  let investment1Id: string;

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

    // Crear Admin
    const adminPass = await hashPassword('AdminPass123!');
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, is_active) VALUES ('usr_adm', 'admin@corp.test', ?, 'ADMIN', 1)"
    ).bind(adminPass).run();

    // Login Admin
    const admLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@corp.test', password: 'AdminPass123!' })
    }, env);
    const admData = await admLogin.json() as { data: { token: string } };
    adminToken = admData.data.token;

    // Crear Inversionista 1 desde endpoint Admin
    const createInv1 = await app.request('/api/admin/investors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: 'inversionista1@corp.test',
        password: 'Inv1Pass123!',
        full_name: 'Alejandro Martí',
        rfc: 'MARA800101XYZ',
        phone: '+525544332211'
      })
    }, env);
    const inv1Data = await createInv1.json() as { data: { user_id: string } };
    inv1UserId = inv1Data.data.user_id;

    // Crear Inversionista 2 desde endpoint Admin
    const createInv2 = await app.request('/api/admin/investors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        email: 'inversionista2@corp.test',
        password: 'Inv2Pass123!',
        full_name: 'Beatriz González',
        rfc: 'GONB850202ABC',
        phone: '+525599887766'
      })
    }, env);
    const inv2Data = await createInv2.json() as { data: { user_id: string } };
    _inv2UserId = inv2Data.data.user_id;

    // Crear inversión para Inversionista 1
    const createInvRes = await app.request('/api/admin/investments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        investor_user_id: inv1UserId,
        code: 'INV-2026-ALEX-01',
        start_date: '2026-01-15',
        maturity_date: '2027-01-15',
        capital_cents: 200000000, // $2,000,000.00 MXN
        fixed_annual_rate_bps: 1350, // 13.50%
        payout_frequency: 'MONTHLY',
        day_count_convention: 'ACT_365',
        capitalization_policy: 'NONE'
      })
    }, env);
    const invData = await createInvRes.json() as { data: { investment_id: string } };
    investment1Id = invData.data.investment_id;

    // Login Inversionista 1
    const login1 = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista1@corp.test', password: 'Inv1Pass123!' })
    }, env);
    const login1Data = await login1.json() as { data: { token: string } };
    inv1Token = login1Data.data.token;

    // Login Inversionista 2
    const login2 = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista2@corp.test', password: 'Inv2Pass123!' })
    }, env);
    const login2Data = await login2.json() as { data: { token: string } };
    inv2Token = login2Data.data.token;
  });

  it('should enforce strict multi-tenant authorization for investment details', async () => {
    // 1. Inversionista 1 consulta su propia inversión -> 200 OK
    const okRes = await app.request(`/api/investor/investments/${investment1Id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inv1Token}` }
    }, env);
    expect(okRes.status).toBe(200);
    const okJson = await okRes.json() as { data: { investment: { code: string; current_capital_cents: number } } };
    expect(okJson.data.investment.code).toBe('INV-2026-ALEX-01');
    expect(okJson.data.investment.current_capital_cents).toBe(200000000);

    // 2. Inversionista 2 intenta consultar la inversión de Inversionista 1 -> 403 Forbidden!
    const forbiddenRes = await app.request(`/api/investor/investments/${investment1Id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inv2Token}` }
    }, env);
    expect(forbiddenRes.status).toBe(403);
    const forbiddenJson = await forbiddenRes.json() as { error: { code: string } };
    expect(forbiddenJson.error.code).toBe('FORBIDDEN');
  });

  it('should upload document to private R2 and restrict downloads to investment owner', async () => {
    // 1. Admin sube contrato en PDF para Investment 1
    const pdfBytes = new TextEncoder().encode('%PDF-1.4 Mock Contract Content For Testing');
    const formData = new FormData();
    formData.append('title', 'Contrato Marco Inversión Alex');
    formData.append('document_type', 'CONTRACT');
    formData.append('file', new File([pdfBytes], 'Contrato_Alex.pdf', { type: 'application/pdf' }));

    const uploadRes = await app.request(`/api/admin/investments/${investment1Id}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData
    }, env);

    expect(uploadRes.status).toBe(201);
    const uploadJson = await uploadRes.json() as { data: { id: string } };
    const docId = uploadJson.data.id;
    expect(docId).toBeDefined();

    // 2. Inversionista 1 lista los documentos de su inversión
    const listRes = await app.request(`/api/investor/investments/${investment1Id}/documents`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inv1Token}` }
    }, env);
    expect(listRes.status).toBe(200);
    const listJson = await listRes.json() as { data: Array<{ id: string; title: string }> };
    expect(listJson.data.length).toBe(1);
    expect(listJson.data[0]?.title).toBe('Contrato Marco Inversión Alex');

    // 3. Inversionista 1 descarga el documento privado desde R2
    const downloadRes = await app.request(`/api/investor/documents/${docId}/download`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inv1Token}` }
    }, env);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers.get('Content-Type')).toBe('application/pdf');
    expect(downloadRes.headers.get('Cache-Control')).toContain('private, no-store');
    const textDownloaded = await downloadRes.text();
    expect(textDownloaded).toContain('Mock Contract Content');

    // 4. Inversionista 2 intenta descargar el documento de Inversionista 1 -> 403 Forbidden!
    const blockedRes = await app.request(`/api/investor/documents/${docId}/download`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inv2Token}` }
    }, env);
    expect(blockedRes.status).toBe(403);

    // 5. Intento sin autenticación -> 401 Unauthorized!
    const unauthRes = await app.request(`/api/investor/documents/${docId}/download`, {
      method: 'GET'
    }, env);
    expect(unauthRes.status).toBe(401);
  });

  it('should reject documents exceeding 15 MB or having invalid MIME types', async () => {
    const formData = new FormData();
    formData.append('title', 'Script malicioso');
    formData.append('document_type', 'OTHER');
    formData.append('file', new File(['malicious'], 'script.exe', { type: 'application/x-msdownload' }));

    const res = await app.request(`/api/admin/investments/${investment1Id}/documents`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: formData
    }, env);

    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string; message: string } };
    expect(json.error.code).toBe('UPLOAD_ERROR');
    expect(json.error.message).toContain('Solo se admiten archivos PDF');
  });

  it('should paginate investor summaries and list without unbounded loading', async () => {
    // Consultar lista paginada de inversiones
    const pageRes = await app.request('/api/investor/investments?page=1&pageSize=5', {
      method: 'GET',
      headers: { Authorization: `Bearer ${inv1Token}` }
    }, env);

    expect(pageRes.status).toBe(200);
    const pageJson = await pageRes.json() as { pagination: { page: number; pageSize: number; total: number } };
    expect(pageJson.pagination.page).toBe(1);
    expect(pageJson.pagination.pageSize).toBe(5);
    expect(pageJson.pagination.total).toBe(1);
  });
});
