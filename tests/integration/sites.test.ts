import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, type Env } from '../../src/worker/index';
import { ADMIN_PASSWORD, INVESTOR_PASSWORD, login, makeEnv, seedAdmin, seedInvestor } from '../helpers/app';

// Dos sitios, un Worker: página corporativa en el dominio raíz y portal en el subdominio de clientes.
const PUBLIC = 'https://pimexfortexcapital.com.mx';
const PORTAL = 'https://clientes.pimexfortexcapital.com.mx';
const INDEX = '<!doctype html><html><head><title>Portal</title></head><body><div id="root"></div></body></html>';

/** Simula el binding ASSETS: archivos con hash en /assets, el resto responde index.html (modo SPA). */
const fakeAssets = {
  fetch: async (req: Request) => {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/assets/')) {
      return new Response('console.log(1)', { headers: { 'content-type': 'application/javascript', 'cache-control': 'public, max-age=31536000, immutable' } });
    }
    return new Response(INDEX, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"abc"' } });
  }
} as unknown as Fetcher;

const get = (env: Env, url: string, headers: Record<string, string> = {}) => app.request(url, { headers }, env);

describe('Sitio público y portal de clientes en dominios separados', () => {
  let env: Env;

  beforeEach(async () => {
    env = makeEnv({
      ENVIRONMENT: 'production',
      APP_BASE_URL: PORTAL,
      PUBLIC_HOST: 'pimexfortexcapital.com.mx',
      PORTAL_HOST: 'clientes.pimexfortexcapital.com.mx',
      ASSETS: fakeAssets,
      FINANCIAL_RULES_APPROVED: 'false'
    });
    await seedInvestor(env, { id: 'usr_inv', email: 'hector.galeana@ficticio.test', name: 'Héctor Galeana' });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('dominio raíz: entrega la página corporativa e indica a React que es el sitio público', async () => {
    const res = await get(env, `${PUBLIC}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`<meta name="site" data-kind="public" data-public-url="${PUBLIC}" data-portal-url="${PORTAL}">`);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('etag')).toBeNull();
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
  });

  it('dominio raíz: login, recuperación y paneles redirigen al subdominio de clientes', async () => {
    for (const path of ['/login', '/recuperar', '/restablecer?token=abc', '/app', '/app/inversiones/x', '/admin', '/admin/clientes']) {
      const res = await get(env, `${PUBLIC}${path}`);
      expect(res.status, path).toBe(302);
      expect(res.headers.get('location')).toBe(`${PORTAL}${path}`);
    }
    // Rutas parecidas que no son del portal no se redirigen; los documentos legales viven en el sitio público
    expect((await get(env, `${PUBLIC}/application`)).status).toBe(200);
    expect((await get(env, `${PUBLIC}/legal/aviso-de-privacidad`)).status).toBe(200);
  });

  it('dominio raíz: no expone la API (ni lectura ni escritura)', async () => {
    expect((await get(env, `${PUBLIC}/api/auth/me`)).status).toBe(404);
    expect((await get(env, `${PUBLIC}/api/health`)).status).toBe(404);
    const post = await app.request(`${PUBLIC}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: PUBLIC },
      body: JSON.stringify({ email: 'hector.galeana@ficticio.test', password: INVESTOR_PASSWORD })
    }, env);
    expect(post.status).toBe(404);
    expect(post.headers.get('set-cookie')).toBeNull();
  });

  it('www redirige permanentemente al dominio sin www', async () => {
    const res = await get(env, 'https://www.pimexfortexcapital.com.mx/?ref=1');
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(`${PUBLIC}/?ref=1`);
  });

  it('subdominio de clientes: la raíz es el portal (React muestra login o panel según la sesión)', async () => {
    for (const path of ['/', '/login', '/app', '/admin/estadisticas']) {
      const res = await get(env, `${PORTAL}${path}`);
      expect(res.status, path).toBe(200);
      expect(await res.text()).toContain(`data-kind="portal" data-public-url="${PUBLIC}" data-portal-url="${PORTAL}"`);
    }
  });

  it('subdominio de clientes: la API protege en el servidor, no solo en React', async () => {
    // Sin sesión
    expect((await get(env, `${PORTAL}/api/auth/me`)).status).toBe(401);
    expect((await get(env, `${PORTAL}/api/investor/summary`)).status).toBe(401);
    expect((await get(env, `${PORTAL}/api/admin/investors`)).status).toBe(401);
    // Ruta de API inexistente: JSON 404, nunca la SPA
    const missing = await get(env, `${PORTAL}/api/no-existe`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('content-type')).toContain('application/json');

    // Inicio de sesión desde el propio portal: cookie HttpOnly, Secure, SameSite=Strict y SIN Domain
    const res = await app.request(`${PORTAL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: PORTAL, 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify({ email: 'hector.galeana@ficticio.test', password: INVESTOR_PASSWORD })
    }, env);
    expect(res.status).toBe(200);
    const cookieHeader = res.headers.get('set-cookie') ?? '';
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/Secure/i);
    expect(cookieHeader).toMatch(/SameSite=Strict/i);
    expect(cookieHeader).not.toMatch(/Domain=/i);
    const cookie = cookieHeader.split(';')[0]!;

    // Inversionista: su información sí; administración no
    expect((await get(env, `${PORTAL}/api/investor/summary`, { Cookie: cookie })).status).toBe(200);
    expect((await get(env, `${PORTAL}/api/admin/investors`, { Cookie: cookie })).status).toBe(403);
  });

  it('administración en producción exige MFA activo aunque la contraseña sea correcta', async () => {
    await seedAdmin(env);
    const admin = await login({ ...env, REQUIRE_ADMIN_MFA: 'false' }, 'admin@ficticio.test', ADMIN_PASSWORD);
    const res = await get(env, `${PORTAL}/api/admin/investors`, { Cookie: admin.cookie });
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('MFA_SETUP_REQUIRED');
  });

  it('CSRF: el portal rechaza escrituras con Origin del sitio público u otro dominio', async () => {
    for (const origin of [PUBLIC, 'https://evil.example']) {
      const res = await app.request(`${PORTAL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin },
        body: JSON.stringify({ email: 'hector.galeana@ficticio.test', password: INVESTOR_PASSWORD })
      }, env);
      expect(res.status, origin).toBe(403);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('recuperación de contraseña: el enlace del correo apunta al subdominio de clientes', async () => {
    const sent: Array<{ text: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response('{}', { status: 200 });
    }));
    const mailEnv = { ...env, EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'clave-ficticia' };
    const res = await app.request(`${PORTAL}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: PORTAL },
      body: JSON.stringify({ email: 'hector.galeana@ficticio.test' })
    }, mailEnv);
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toMatch(/https:\/\/clientes\.pimexfortexcapital\.com\.mx\/restablecer\?token=\S+/);
  });

  it('archivos estáticos: conservan su caché y no llevan la política de páginas', async () => {
    for (const base of [PUBLIC, PORTAL]) {
      const res = await get(env, `${base}/assets/index-abc123.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('content-security-policy')).toBeNull();
    }
  });

  it('sin dominios configurados (desarrollo, staging, workers.dev) funciona como un solo sitio', async () => {
    const combined = makeEnv({ ASSETS: fakeAssets });
    const res = await get(combined, 'http://localhost:8787/login');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('data-kind="combined"');
    expect((await get(combined, 'http://localhost:8787/api/auth/me')).status).toBe(401);
  });
});
