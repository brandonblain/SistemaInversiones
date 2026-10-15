import { describe, it, expect, beforeEach } from 'vitest';
import { app, Env } from '../../src/worker/index';
import { createTestD1Database, createTestR2Bucket } from '../helpers/d1-mock';
import { hashPassword, generateTotpCode } from '../../src/worker/services/crypto';

describe('Auth & Role Enforcement Suite', () => {
  let env: Env;

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

    // Crear admin y un inversionista
    const adminPassHash = await hashPassword('AdminSecret123!');
    const investorPassHash = await hashPassword('InvestorSecret123!');

    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled, mfa_secret)
       VALUES ('usr_admin', 'admin@portal.test', ?, 'ADMIN', 1, 0, NULL)`
    ).bind(adminPassHash).run();

    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled)
       VALUES ('usr_inv1', 'inversionista1@portal.test', ?, 'INVESTOR', 1, 0)`
    ).bind(investorPassHash).run();

    await env.DB.prepare(
      `INSERT INTO investor_profiles (id, user_id, full_name, rfc, phone)
       VALUES ('prof_inv1', 'usr_inv1', 'Carlos Slim Test', 'SLIC800101XYZ', '+525511223344')`
    ).run();
  });

  it('should successfully log in investor and reject invalid password', async () => {
    // 1. Password incorrecto
    const badRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista1@portal.test', password: 'WrongPassword' })
    }, env);

    expect(badRes.status).toBe(401);
    const badJson = await badRes.json() as { success: boolean; error: { code: string } };
    expect(badJson.success).toBe(false);
    expect(badJson.error.code).toBe('INVALID_CREDENTIALS');

    // 2. Password correcto
    const okRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista1@portal.test', password: 'InvestorSecret123!' })
    }, env);

    expect(okRes.status).toBe(200);
    const okJson = await okRes.json() as { success: boolean; data: { token: string; user: { role: string }; investor_profile: { full_name: string } } };
    expect(okJson.success).toBe(true);
    expect(okJson.data.user.role).toBe('INVESTOR');
    expect(okJson.data.investor_profile.full_name).toBe('Carlos Slim Test');
    expect(okJson.data.token).toBeDefined();

    // 3. Probar /api/auth/me usando Bearer token
    const meRes = await app.request('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${okJson.data.token}` }
    }, env);

    expect(meRes.status).toBe(200);
    const meJson = await meRes.json() as { data: { user: { email: string } } };
    expect(meJson.data.user.email).toBe('inversionista1@portal.test');
  });

  it('should enforce MFA for admin when enabled', async () => {
    // 1. Login admin
    const adminLogin = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@portal.test', password: 'AdminSecret123!' })
    }, env);
    const adminData = await adminLogin.json() as { data: { token: string } };
    const adminToken = adminData.data.token;

    // 2. Setup MFA
    const setupRes = await app.request('/api/auth/admin/mfa/setup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    }, env);
    expect(setupRes.status).toBe(200);
    const setupJson = await setupRes.json() as { data: { secret: string; otpauth_url: string } };
    const secret = setupJson.data.secret;
    expect(secret).toBeDefined();

    // 3. Activar MFA con código TOTP válido
    const validOtp = await generateTotpCode(secret);
    const verifyRes = await app.request('/api/auth/admin/mfa/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ token: validOtp })
    }, env);
    expect(verifyRes.status).toBe(200);

    // 4. Intentar login sin MFA (debe solicitar MFA)
    const mfaRequiredRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@portal.test', password: 'AdminSecret123!' })
    }, env);
    expect(mfaRequiredRes.status).toBe(401);
    const mfaRequiredJson = await mfaRequiredRes.json() as { error: { code: string } };
    expect(mfaRequiredJson.error.code).toBe('MFA_REQUIRED');

    // 5. Login con MFA correcto
    const mfaCode = await generateTotpCode(secret);
    const mfaLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@portal.test',
        password: 'AdminSecret123!',
        mfa_token: mfaCode
      })
    }, env);
    expect(mfaLoginRes.status).toBe(200);
  });

  it('should allow user to change password and audit the event', async () => {
    // 1. Login
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista1@portal.test', password: 'InvestorSecret123!' })
    }, env);
    const loginJson = await loginRes.json() as { data: { token: string } };
    const token = loginJson.data.token;

    // 2. Cambiar contraseña
    const changeRes = await app.request('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        current_password: 'InvestorSecret123!',
        new_password: 'BrandNewSecurePass2026!'
      })
    }, env);
    expect(changeRes.status).toBe(200);

    // 3. Probar login con contraseña antigua (debe fallar)
    const oldLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista1@portal.test', password: 'InvestorSecret123!' })
    }, env);
    expect(oldLoginRes.status).toBe(401);

    // 4. Probar login con nueva contraseña (debe funcionar)
    const newLoginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'inversionista1@portal.test', password: 'BrandNewSecurePass2026!' })
    }, env);
    expect(newLoginRes.status).toBe(200);

    // 5. Verificar que se registró la notificación y la auditoría
    const auditRows = await env.DB.prepare(
      "SELECT action, user_id FROM audit_logs WHERE action = 'PASSWORD_CHANGED'"
    ).all<{ action: string; user_id: string }>();
    expect(auditRows.results.length).toBe(1);

    const notifRows = await env.DB.prepare(
      "SELECT event_type FROM notification_events WHERE event_type = 'PASSWORD_CHANGED'"
    ).all();
    expect(notifRows.results.length).toBe(1);
  });
});
