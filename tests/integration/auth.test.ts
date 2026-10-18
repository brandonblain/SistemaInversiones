import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, type Env } from '../../src/worker/index';
import { generateBase32Secret, generateTotpCode } from '../../src/worker/services/crypto';
import { ADMIN_PASSWORD, anonymous, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor } from '../helpers/app';

const postJson = (env: Env, path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }, env);

describe('Autenticación', () => {
  let env: Env;
  beforeEach(async () => {
    env = makeEnv();
    await seedAdmin(env);
    await seedInvestor(env, { id: 'usr_inv', email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('login correcto emite cookie HttpOnly/Secure/SameSite=Strict y /me responde', async () => {
    const res = await postJson(env, '/api/auth/login', { email: 'HECTOR.GALEANA@ficticio.test', password: INVESTOR_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/auth_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const me = await anonymous(env).call('GET', '/api/auth/me', undefined, { Cookie: cookie.split(';')[0]! });
    expect(me.json.data.user.email).toBe('hector.galeana@ficticio.test');
    expect(me.json.data.investor_profile.full_name).toBe('Héctor Galeana');
  });

  it('en producción el token NO viaja en el cuerpo de la respuesta', async () => {
    const prod = makeEnv({ ENVIRONMENT: 'production' });
    await seedInvestor(prod, { email: 'cesar.daniel@ficticio.test' });
    const res = await postJson(prod, '/api/auth/login', { email: 'cesar.daniel@ficticio.test', password: INVESTOR_PASSWORD });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.data.token).toBeUndefined();
  });

  it('credenciales inválidas: mismo error exista o no el correo; bloqueo tras 5 fallos', async () => {
    const a = await postJson(env, '/api/auth/login', { email: 'no-existe@ficticio.test', password: 'x' });
    const b = await postJson(env, '/api/auth/login', { email: 'hector.galeana@ficticio.test', password: 'incorrecta' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(((await a.json()) as any).error.code).toBe('INVALID_CREDENTIALS');
    for (let i = 0; i < 4; i++) await postJson(env, '/api/auth/login', { email: 'hector.galeana@ficticio.test', password: 'incorrecta' });
    const locked = await postJson(env, '/api/auth/login', { email: 'hector.galeana@ficticio.test', password: INVESTOR_PASSWORD });
    expect(locked.status).toBe(429);
    expect(((await locked.json()) as any).error.code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('cuenta deshabilitada no entra (solo se revela con la contraseña correcta)', async () => {
    await seedInvestor(env, { email: 'inactiva@ficticio.test', active: false });
    const res = await postJson(env, '/api/auth/login', { email: 'inactiva@ficticio.test', password: INVESTOR_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('MFA obligatorio: admin sin MFA no accede a /api/admin; tras activarlo, el código se exige y no se reutiliza', async () => {
    const strict = makeEnv({ REQUIRE_ADMIN_MFA: undefined });
    await seedAdmin(strict);
    const admin = await login(strict, 'admin@ficticio.test', ADMIN_PASSWORD);
    const blocked = await admin.call('GET', '/api/admin/summary');
    expect(blocked.status).toBe(403);
    expect(blocked.json.error.code).toBe('MFA_SETUP_REQUIRED');

    const setup = await admin.call('POST', '/api/auth/admin/mfa/setup');
    const secret = setup.json.data.secret as string;
    expect(secret).toHaveLength(32);
    const verify = await admin.call('POST', '/api/auth/admin/mfa/verify', { token: await generateTotpCode(secret) });
    expect(verify.status).toBe(200);
    expect((await admin.call('GET', '/api/admin/summary')).status).toBe(200);
    // Un segundo setup no puede reemplazar el secreto activo
    expect((await admin.call('POST', '/api/auth/admin/mfa/setup')).status).toBe(409);

    const noCode = await postJson(strict, '/api/auth/login', { email: 'admin@ficticio.test', password: ADMIN_PASSWORD });
    expect(((await noCode.json()) as any).error.code).toBe('MFA_REQUIRED');
    // El código usado en la verificación ya no sirve (anti-replay)
    const replay = await postJson(strict, '/api/auth/login', { email: 'admin@ficticio.test', password: ADMIN_PASSWORD, mfa_token: await generateTotpCode(secret) });
    expect(replay.status).toBe(401);
    expect(((await replay.json()) as any).error.code).toBe('MFA_INVALID');
  });

  it('MFA válido con un contador nuevo permite entrar', async () => {
    const strict = makeEnv({ REQUIRE_ADMIN_MFA: undefined });
    const secret = generateBase32Secret();
    await seedAdmin(strict, { mfaSecret: secret });
    const res = await postJson(strict, '/api/auth/login', { email: 'admin@ficticio.test', password: ADMIN_PASSWORD, mfa_token: await generateTotpCode(secret) });
    expect(res.status).toBe(200);
  });

  it('el inversionista no accede a rutas de administración y el admin no usa rutas de inversionista', async () => {
    const inv = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    expect((await inv.call('GET', '/api/admin/investors')).status).toBe(403);
    const admin = await login(env, 'admin@ficticio.test', ADMIN_PASSWORD);
    expect((await admin.call('GET', '/api/investor/summary')).status).toBe(403);
    expect((await anonymous(env).call('GET', '/api/investor/summary')).status).toBe(401);
  });

  it('cambio de contraseña: valida política, cierra otras sesiones y encola aviso sin datos sensibles', async () => {
    const s1 = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    const s2 = await login(env, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);
    const weak = await s1.call('POST', '/api/auth/change-password', { current_password: INVESTOR_PASSWORD, new_password: 'corta' });
    expect(weak.json.error.code).toBe('WEAK_PASSWORD');
    const ok = await s1.call('POST', '/api/auth/change-password', { current_password: INVESTOR_PASSWORD, new_password: 'NuevaClave2026' });
    expect(ok.status).toBe(200);
    expect((await s1.call('GET', '/api/auth/me')).status).toBe(200);
    expect((await s2.call('GET', '/api/auth/me')).status).toBe(401);
    const n = await env.DB.prepare("SELECT body_preview FROM notification_events WHERE event_type = 'PASSWORD_CHANGED'").first<{ body_preview: string }>();
    expect(n?.body_preview).not.toMatch(/NuevaClave/);
    // Cambiar contraseña no altera otros datos del perfil
    const prof = await env.DB.prepare("SELECT full_name FROM investor_profiles WHERE user_id = 'usr_inv'").first<{ full_name: string }>();
    expect(prof?.full_name).toBe('Héctor Galeana');
  });

  it('recuperación: correo con enlace, token de un solo uso, cierra sesiones; respuesta constante', async () => {
    const sent: Array<{ to: string[]; text: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    }));
    const mailEnv = { ...env, EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'clave-ficticia' };
    const session = await login(mailEnv, 'hector.galeana@ficticio.test', INVESTOR_PASSWORD);

    const unknown = await postJson(mailEnv, '/api/auth/request-password-reset', { email: 'nadie@ficticio.test' });
    const known = await postJson(mailEnv, '/api/auth/request-password-reset', { email: 'hector.galeana@ficticio.test' });
    expect(await unknown.text()).toBe(await known.text());
    expect(sent).toHaveLength(1);
    const link = /https:\/\/portal\.ficticio\.test\/restablecer\?token=(\S+)/.exec(sent[0]!.text);
    expect(link).not.toBeNull();
    const token = decodeURIComponent(link![1]!);
    // El secreto no se guarda en la cola de avisos
    const stored = await env.DB.prepare("SELECT body_preview FROM notification_events WHERE event_type = 'PASSWORD_RESET_REQUESTED'").first<{ body_preview: string }>();
    expect(stored?.body_preview).not.toContain(token);

    const ok = await postJson(mailEnv, '/api/auth/reset-password', { token, new_password: 'Recuperada2026' });
    expect(ok.status).toBe(200);
    const again = await postJson(mailEnv, '/api/auth/reset-password', { token, new_password: 'OtraClave2026' });
    expect(((await again.json()) as any).error.code).toBe('INVALID_OR_EXPIRED_TOKEN');
    expect((await session.call('GET', '/api/auth/me')).status).toBe(401);
    expect((await postJson(mailEnv, '/api/auth/login', { email: 'hector.galeana@ficticio.test', password: 'Recuperada2026' })).status).toBe(200);
  });

  it('enlace de recuperación expirado (1 hora) no funciona', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body)).text); return new Response('{}'); }));
    const mailEnv = { ...env, EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'clave-ficticia' };
    await postJson(mailEnv, '/api/auth/request-password-reset', { email: 'hector.galeana@ficticio.test' });
    const token = decodeURIComponent(/token=(\S+)/.exec(sent[0]!)![1]!);
    await env.DB.prepare("UPDATE password_reset_tokens SET expires_at = datetime('now', '-1 minute')").run();
    const res = await postJson(mailEnv, '/api/auth/reset-password', { token, new_password: 'Recuperada2026' });
    expect(res.status).toBe(400);
  });

  it('CSRF: rechaza escrituras desde otro origen', async () => {
    const res = await postJson(env, '/api/auth/login', { email: 'hector.galeana@ficticio.test', password: INVESTOR_PASSWORD }, { Origin: 'https://sitio-malicioso.example' });
    expect(res.status).toBe(403);
    const same = await postJson(env, '/api/auth/login', { email: 'hector.galeana@ficticio.test', password: INVESTOR_PASSWORD }, { Origin: 'https://portal.ficticio.test' });
    expect(same.status).toBe(200);
  });

  it('errores siempre en JSON con el sobre del contrato', async () => {
    const res = await app.request('/api/no-existe', {}, env);
    expect(res.status).toBe(404);
    expect(((await res.json()) as any).success).toBe(false);
    const bad = await app.request('/api/auth/login', { method: 'POST', body: 'no-json', headers: { 'Content-Type': 'application/json' } }, env);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBe('INVALID_INPUT');
  });
});
