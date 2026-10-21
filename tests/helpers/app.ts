// Utilidades de prueba: entorno, usuarios semilla e inicio de sesión real por cookie HttpOnly.
import { app, type Env } from '../../src/worker/index';
import { generateSecureToken, hashPassword } from '../../src/worker/services/crypto';
import { createTestD1Database, createTestR2Bucket } from './d1-mock';

export const ADMIN_PASSWORD = 'AdminFicticio2026';
export const INVESTOR_PASSWORD = 'InversionFicticia2026';

export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createTestD1Database(),
    DOCS_BUCKET: createTestR2Bucket(),
    ENVIRONMENT: 'test',
    APP_BASE_URL: 'https://portal.ficticio.test',
    DEFAULT_CURRENCY: 'MXN',
    EMAIL_FROM: 'avisos@ficticio.test',
    REQUIRE_ADMIN_MFA: 'false',
    ...overrides
  };
}

export async function seedAdmin(env: Env, opts: { id?: string; email?: string; mfaSecret?: string } = {}) {
  const id = opts.id ?? 'usr_admin';
  await env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, is_active, mfa_enabled, mfa_secret) VALUES (?, ?, ?, 'ADMIN', 1, ?, ?)`
  ).bind(id, opts.email ?? 'admin@ficticio.test', await hashPassword(ADMIN_PASSWORD), opts.mfaSecret ? 1 : 0, opts.mfaSecret ?? null).run();
  return id;
}

export async function seedInvestor(env: Env, opts: { id?: string; email?: string; name?: string; active?: boolean } = {}) {
  const id = opts.id ?? generateSecureToken('usr');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, 'INVESTOR', ?)`)
      .bind(id, opts.email ?? `${id}@ficticio.test`, await hashPassword(INVESTOR_PASSWORD), opts.active === false ? 0 : 1),
    env.DB.prepare('INSERT INTO investor_profiles (id, user_id, full_name) VALUES (?, ?, ?)').bind(`prof_${id}`, id, opts.name ?? 'Inversionista FICTICIO')
  ]);
  return id;
}

export interface Client {
  cookie: string;
  call: <T = any>(method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; json: T; res: Response }>;
}

/** Inicia sesión con la API real y devuelve un cliente que envía la cookie de sesión. */
export async function login(env: Env, email: string, password: string, mfa_token?: string): Promise<Client> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, ...(mfa_token ? { mfa_token } : {}) })
  }, env);
  if (res.status !== 200) throw new Error(`login ${email} → ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return clientFor(env, cookie);
}

export function clientFor(env: Env, cookie: string): Client {
  return {
    cookie,
    call: async (method, path, body, headers = {}) => {
      const init: RequestInit = { method, headers: { Cookie: cookie, ...headers } };
      if (body instanceof FormData) init.body = body;
      else if (body !== undefined) {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await app.request(path, init, env);
      const type = res.headers.get('content-type') ?? '';
      const json = type.includes('application/json') ? await res.clone().json() : null;
      return { status: res.status, json: json as any, res };
    }
  };
}

export const anonymous = (env: Env) => clientFor(env, '');

/** Crea una inversión por la API de administración y devuelve su id. */
export async function createInvestment(admin: Client, investorId: string, overrides: Record<string, unknown> = {}) {
  const r = await admin.call('POST', '/api/admin/investments', {
    investor_user_id: investorId,
    code: `FICT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    investment_type: 'ELECTRIC_MOBILITY',
    currency: 'MXN',
    start_date: '2026-01-15',
    maturity_date: '2027-01-15',
    capital_cents: 25_000_000,
    fixed_annual_rate_bps: 1600,
    payout_frequency: 'MONTHLY',
    day_count_convention: 'ACT_365',
    capitalization_policy: 'NONE',
    ...overrides
  });
  if (r.status !== 201) throw new Error(`createInvestment → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json.data.investment_id as string;
}

/** Confirma un periodo con vista previa + confirmación, como lo hace la UI. */
export async function confirmPeriod(admin: Client, investmentId: string, start: string, end: string) {
  const p = await admin.call('POST', '/api/admin/yields/preview', { investment_id: investmentId, period_start: start, period_end: end });
  if (p.status !== 200) throw new Error(`preview → ${p.status} ${JSON.stringify(p.json)}`);
  const c = await admin.call('POST', '/api/admin/yields/confirm', {
    investment_id: investmentId, period_start: start, period_end: end, amount_cents: p.json.data.calculated_yield_cents
  });
  if (c.status !== 201 && c.status !== 200) throw new Error(`confirm → ${c.status} ${JSON.stringify(c.json)}`);
  return { id: c.json.data.yield_entry_id as string, amount: c.json.data.amount_cents as number };
}
