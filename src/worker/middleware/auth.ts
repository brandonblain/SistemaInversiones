// Middleware de Autenticación, Roles y Aislamiento por Titular
import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { hashToken } from '../services/crypto';
import type { Env, AppVariables } from '../index';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'INVESTOR';
  is_active: number;
  mfa_enabled: number;
}

export interface InvestorProfile {
  id: string;
  user_id: string;
  full_name: string;
  rfc: string | null;
  phone: string | null;
  address: string | null;
}

export type AuthContext = Context<{ Bindings: Env; Variables: AppVariables }>;

export const SESSION_COOKIE = 'auth_session';
export const isProduction = (env: Env) => env.ENVIRONMENT === 'production';
export const clientIp = (c: Context) => c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || null;

const fail = (c: Context, status: 401 | 403, code: string, message: string) =>
  c.json({ success: false, error: { code, message, details: null } }, status);

export async function securityHeadersMiddleware(c: AuthContext, next: Next) {
  await next();
  c.header('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (c.env.ENVIRONMENT !== 'development' && c.env.ENVIRONMENT !== 'test') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

/**
 * Protección CSRF adicional a SameSite=Strict: las peticiones que modifican datos y traen Origin
 * deben venir del dominio del portal (o de ALLOWED_ORIGINS). Clientes sin navegador no envían Origin.
 */
export async function originGuardMiddleware(c: AuthContext, next: Next) {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const origin = c.req.header('origin');
  const fetchSite = c.req.header('sec-fetch-site');
  if (fetchSite === 'cross-site') return fail(c, 403, 'CSRF_REJECTED', 'Solicitud de origen no permitido.');
  if (origin) {
    const allowed = new Set<string>();
    try {
      allowed.add(new URL(c.env.APP_BASE_URL).origin);
    } catch {
      /* APP_BASE_URL mal configurada: solo se permitirá ALLOWED_ORIGINS */
    }
    for (const o of (c.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)) allowed.add(o);
    allowed.add(new URL(c.req.url).origin);
    if (!allowed.has(origin)) return fail(c, 403, 'CSRF_REJECTED', 'Solicitud de origen no permitido.');
  }
  return next();
}

export async function authMiddleware(c: AuthContext, next: Next) {
  let token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) token = authHeader.substring(7).trim();
  }
  if (!token) return fail(c, 401, 'UNAUTHORIZED', 'No autenticado.');

  // julianday() interpreta tanto 'YYYY-MM-DD HH:MM:SS' como ISO 8601, evitando comparaciones de texto erróneas.
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.role, u.is_active, u.mfa_enabled,
            p.id AS profile_id, p.full_name, p.rfc, p.phone, p.address
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     LEFT JOIN investor_profiles p ON u.id = p.user_id
     WHERE s.token_hash = ? AND julianday(s.expires_at) > julianday('now')`
  ).bind(await hashToken(token)).first<Record<string, unknown>>();

  if (!row) return fail(c, 401, 'SESSION_EXPIRED', 'Sesión inválida o expirada.');
  if (Number(row.is_active) !== 1) return fail(c, 403, 'ACCOUNT_INACTIVE', 'Cuenta deshabilitada.');

  c.set('user', {
    id: String(row.user_id),
    email: String(row.email),
    role: row.role as 'ADMIN' | 'INVESTOR',
    is_active: Number(row.is_active),
    mfa_enabled: Number(row.mfa_enabled)
  });
  c.set(
    'profile',
    row.profile_id
      ? {
          id: String(row.profile_id),
          user_id: String(row.user_id),
          full_name: String(row.full_name),
          rfc: row.rfc ? String(row.rfc) : null,
          phone: row.phone ? String(row.phone) : null,
          address: row.address ? String(row.address) : null
        }
      : null
  );
  c.set('sessionId', String(row.session_id));
  return next();
}

/** Área de inversionista: solo el rol INVESTOR (el administrador usa sus propias rutas). */
export async function requireInvestor(c: AuthContext, next: Next) {
  const user = c.get('user');
  if (!user) return fail(c, 401, 'UNAUTHORIZED', 'No autenticado.');
  if (user.role !== 'INVESTOR') return fail(c, 403, 'FORBIDDEN', 'Acceso no autorizado para este rol.');
  return next();
}

/** Área administrativa: rol ADMIN y MFA activo (salvo REQUIRE_ADMIN_MFA="false" fuera de producción). */
export async function requireAdmin(c: AuthContext, next: Next) {
  const user = c.get('user');
  if (!user) return fail(c, 401, 'UNAUTHORIZED', 'No autenticado.');
  if (user.role !== 'ADMIN') return fail(c, 403, 'FORBIDDEN', 'Acceso no autorizado para este rol.');
  const mfaRequired = isProduction(c.env) || c.env.REQUIRE_ADMIN_MFA !== 'false';
  if (mfaRequired && user.mfa_enabled !== 1) {
    return fail(c, 403, 'MFA_SETUP_REQUIRED', 'Active la verificación en dos pasos (MFA) para usar la administración.');
  }
  return next();
}

/** Verifica titularidad: la inversión debe pertenecer al usuario autenticado. */
export async function assertInvestorOwnsInvestment(db: D1Database, userId: string, investmentId: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM investments WHERE id = ? AND investor_user_id = ?').bind(investmentId, userId).first();
  return !!row;
}
