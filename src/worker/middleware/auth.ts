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

export async function securityHeadersMiddleware(c: AuthContext, next: Next) {
  await next();
  c.header('Cache-Control', 'private, no-store, no-cache, must-revalidate');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
}

export async function authMiddleware(c: AuthContext, next: Next) {
  // 1. Obtener token de cookie HttpOnly o Header Bearer
  let token = getCookie(c, 'auth_session');
  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  if (!token) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, 401);
  }

  const tokenHashed = await hashToken(token);

  // 2. Validar sesión activa en base de datos
  const sessionRow = await c.env.DB.prepare(
    `SELECT s.id as session_id, s.user_id, s.expires_at,
            u.id as user_id, u.email, u.role, u.is_active, u.mfa_enabled,
            p.id as profile_id, p.full_name, p.rfc, p.phone, p.address
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     LEFT JOIN investor_profiles p ON u.id = p.user_id
     WHERE s.token_hash = ? AND s.expires_at > datetime('now')`
  ).bind(tokenHashed).first<Record<string, unknown>>();

  if (!sessionRow) {
    return c.json({ success: false, error: { code: 'SESSION_EXPIRED', message: 'Sesión inválida o expirada.' } }, 401);
  }

  if (Number(sessionRow.is_active) !== 1) {
    return c.json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Cuenta deshabilitada.' } }, 403);
  }

  const user: AuthenticatedUser = {
    id: String(sessionRow.user_id),
    email: String(sessionRow.email),
    role: sessionRow.role as 'ADMIN' | 'INVESTOR',
    is_active: Number(sessionRow.is_active),
    mfa_enabled: Number(sessionRow.mfa_enabled)
  };

  const profile: InvestorProfile | null = sessionRow.profile_id
    ? {
        id: String(sessionRow.profile_id),
        user_id: String(sessionRow.user_id),
        full_name: String(sessionRow.full_name),
        rfc: sessionRow.rfc ? String(sessionRow.rfc) : null,
        phone: sessionRow.phone ? String(sessionRow.phone) : null,
        address: sessionRow.address ? String(sessionRow.address) : null
      }
    : null;

  c.set('user', user);
  c.set('profile', profile);
  c.set('sessionId', String(sessionRow.session_id));

  return next();
}

export function requireRole(role: 'ADMIN' | 'INVESTOR') {
  return async (c: AuthContext, next: Next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }, 401);
    }

    if (user.role !== role && user.role !== 'ADMIN') {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acceso no autorizado para este rol.' } }, 403);
    }

    return next();
  };
}

export async function assertInvestorOwnsInvestment(db: D1Database, userId: string, investmentId: string): Promise<boolean> {
  const row = await db.prepare(
    'SELECT id FROM investments WHERE id = ? AND investor_user_id = ?'
  ).bind(investmentId, userId).first();

  return !!row;
}
