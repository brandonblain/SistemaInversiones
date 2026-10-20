// Rutas de Autenticación, MFA, Cambio y Recuperación de Contraseña
import { Hono, type Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  generateBase32Secret,
  matchTotpCounter,
  DUMMY_PASSWORD_HASH
} from '../services/crypto';
import { auditStatement } from '../services/audit';
import { enqueueStatement, sendImmediate } from '../services/notifications';
import { authMiddleware, clientIp, SESSION_COOKIE } from '../middleware/auth';
import { AppError, badRequest, conflict } from '../lib/errors';
import { assertPassword, isEmail, readJson } from '../lib/validate';
import type { Env, AppVariables } from '../index';

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const SESSION_HOURS = { ADMIN: 12, INVESTOR: 24 * 7 } as const;
const MAX_FAILED_PER_EMAIL = 5;
const MAX_FAILED_PER_IP = 30;
const LOCK_MINUTES = 15;

/** Ejecuta en segundo plano si hay ExecutionContext (respuesta de tiempo constante); si no, espera. */
async function background(c: Context, task: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(task.catch(() => undefined));
  } catch {
    await task.catch(() => undefined);
  }
}

const attemptStatement = (db: D1Database, email: string, ip: string | null, success: boolean) =>
  db.prepare('INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, ?, ?)')
    .bind(generateSecureToken('att'), email, ip, success ? 1 : 0);

async function assertNotLocked(db: D1Database, email: string, ip: string | null) {
  const row = await db.prepare(
    `SELECT
       (SELECT COUNT(*) FROM login_attempts WHERE email = ? AND success = 0
          AND julianday(created_at) > julianday('now', ?)) AS by_email,
       (SELECT COUNT(*) FROM login_attempts WHERE ip_address = ? AND success = 0
          AND julianday(created_at) > julianday('now', ?)) AS by_ip`
  ).bind(email, `-${LOCK_MINUTES} minutes`, ip ?? '', `-${LOCK_MINUTES} minutes`).first<{ by_email: number; by_ip: number }>();
  if ((row?.by_email ?? 0) >= MAX_FAILED_PER_EMAIL || (ip && (row?.by_ip ?? 0) >= MAX_FAILED_PER_IP)) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', `Demasiados intentos fallidos. Espere ${LOCK_MINUTES} minutos e intente de nuevo.`);
  }
}

// 1. Inicio de sesión
authRoutes.post('/login', async (c) => {
  const body = await readJson(c);
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const mfaToken = typeof body.mfa_token === 'string' ? body.mfa_token.trim() : '';
  if (!email || !password) throw badRequest('INVALID_INPUT', 'Correo y contraseña requeridos.');

  const db = c.env.DB;
  const ip = clientIp(c);
  const userAgent = c.req.header('user-agent') ?? null;
  await assertNotLocked(db, email, ip);

  const user = await db.prepare(
    `SELECT u.id, u.email, u.password_hash, u.role, u.is_active, u.mfa_secret, u.mfa_enabled, u.mfa_last_counter,
            p.id AS profile_id, p.full_name, p.rfc, p.phone, p.address
     FROM users u LEFT JOIN investor_profiles p ON u.id = p.user_id
     WHERE u.email = ?`
  ).bind(email).first<Record<string, unknown>>();

  // Siempre se calcula un hash para no revelar si el correo existe por el tiempo de respuesta.
  const validPassword = await verifyPassword(password, user ? String(user.password_hash) : DUMMY_PASSWORD_HASH);
  if (!user || !validPassword) {
    await attemptStatement(db, email, ip, false).run();
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
  }
  if (Number(user.is_active) !== 1) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'Cuenta deshabilitada. Comuníquese con la administración.');
  }

  const role = user.role as 'ADMIN' | 'INVESTOR';
  const mfaEnabled = Number(user.mfa_enabled) === 1;
  if (role === 'ADMIN' && mfaEnabled) {
    if (!mfaToken) throw new AppError(401, 'MFA_REQUIRED', 'Se requiere el código de verificación de 6 dígitos.');
    const counter = await matchTotpCounter(String(user.mfa_secret ?? ''), mfaToken, 1, Number(user.mfa_last_counter ?? 0));
    const consumed = counter === null
      ? null
      : await db.prepare('UPDATE users SET mfa_last_counter = ? WHERE id = ? AND mfa_last_counter < ?').bind(counter, user.id, counter).run();
    if (!consumed || (consumed.meta?.changes ?? 0) !== 1) {
      await attemptStatement(db, email, ip, false).run();
      throw new AppError(401, 'MFA_INVALID', 'Código de verificación incorrecto o ya utilizado.');
    }
  }

  const sessionToken = generateSecureToken('ses');
  const hours = SESSION_HOURS[role];
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND julianday(expires_at) <= julianday('now')").bind(user.id),
    db.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, datetime('now', ?), ?, ?)`
    ).bind(generateSecureToken('sid'), user.id, await hashToken(sessionToken), `+${hours} hours`, ip, userAgent?.slice(0, 300) ?? null),
    attemptStatement(db, email, ip, true),
    db.prepare("DELETE FROM login_attempts WHERE julianday(created_at) < julianday('now', '-1 day')"),
    auditStatement(db, { userId: String(user.id), action: 'USER_LOGIN', entityType: 'USER', entityId: String(user.id), ipAddress: ip, userAgent })
  ]);

  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Strict',
    path: '/',
    maxAge: hours * 3600
  });

  const exposeToken = c.env.ENVIRONMENT === 'test' || c.env.ENVIRONMENT === 'development';
  return c.json({
    success: true,
    data: {
      ...(exposeToken ? { token: sessionToken } : {}),
      user: {
        id: String(user.id),
        email: String(user.email),
        role,
        is_active: true,
        mfa_enabled: mfaEnabled,
        requires_mfa_setup: role === 'ADMIN' && !mfaEnabled
      },
      investor_profile: user.profile_id
        ? {
            id: String(user.profile_id),
            full_name: String(user.full_name),
            rfc: user.rfc ? String(user.rfc) : null,
            phone: user.phone ? String(user.phone) : null,
            address: user.address ? String(user.address) : null
          }
        : null
    }
  });
});

// 2. Cerrar sesión
authRoutes.post('/logout', authMiddleware, async (c) => {
  const user = c.get('user');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(c.get('sessionId')),
    auditStatement(c.env.DB, { userId: user.id, action: 'USER_LOGOUT', entityType: 'USER', entityId: user.id })
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.json({ success: true, data: { message: 'Sesión cerrada correctamente.' } });
});

// 3. Usuario actual
authRoutes.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        is_active: Boolean(user.is_active),
        mfa_enabled: Boolean(user.mfa_enabled),
        requires_mfa_setup: user.role === 'ADMIN' && !user.mfa_enabled
      },
      investor_profile: profile
        ? { id: profile.id, full_name: profile.full_name, rfc: profile.rfc, phone: profile.phone, address: profile.address }
        : null
    }
  });
});

// 4. Cambio de contraseña (único dato que el inversionista puede modificar)
authRoutes.post('/change-password', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await readJson(c);
  const current = typeof body.current_password === 'string' ? body.current_password : '';
  const next = assertPassword(body.new_password, 'new_password');
  if (!current) throw badRequest('INVALID_INPUT', 'La contraseña actual es obligatoria.');
  if (current === next) throw badRequest('INVALID_INPUT', 'La nueva contraseña debe ser distinta de la actual.');

  const db = c.env.DB;
  const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw badRequest('INVALID_CREDENTIALS', 'La contraseña actual no es correcta.');
  }

  await db.batch([
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(await hashPassword(next), user.id),
    // Cierra las demás sesiones abiertas (otros dispositivos)
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(user.id, c.get('sessionId')),
    enqueueStatement(db, {
      userId: user.id,
      email: user.email,
      type: 'PASSWORD_CHANGED',
      subject: 'Aviso de seguridad: su contraseña ha sido modificada',
      body: 'Se registró un cambio de contraseña en su cuenta del portal privado. Si usted no lo realizó, comuníquese de inmediato con la administración.'
    }),
    auditStatement(db, { userId: user.id, action: 'PASSWORD_CHANGED', entityType: 'USER', entityId: user.id, ipAddress: clientIp(c) })
  ]);

  return c.json({ success: true, data: { message: 'Contraseña actualizada exitosamente.' } });
});

// 5. Solicitud de recuperación (respuesta constante para no revelar si el correo existe)
authRoutes.post('/request-password-reset', async (c) => {
  const body = await readJson(c);
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!isEmail(email)) throw badRequest('INVALID_INPUT', 'Correo no válido.');

  const db = c.env.DB;
  const user = await db.prepare('SELECT id, email, is_active FROM users WHERE email = ?').bind(email).first<{ id: string; email: string; is_active: number }>();

  if (user && Number(user.is_active) === 1) {
    const recent = await db.prepare(
      "SELECT COUNT(*) AS n FROM password_reset_tokens WHERE user_id = ? AND julianday(created_at) > julianday('now', '-1 hour')"
    ).bind(user.id).first<{ n: number }>();

    if ((recent?.n ?? 0) < 3) {
      const rawToken = generateSecureToken('rst');
      await db.batch([
        // Solo el enlace más reciente es válido
        db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").bind(user.id),
        db.prepare(
          "INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, datetime('now', '+1 hour'))"
        ).bind(generateSecureToken('tok'), user.id, await hashToken(rawToken)),
        auditStatement(db, { userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'USER', entityId: user.id, ipAddress: clientIp(c) })
      ]);

      const link = `${c.env.APP_BASE_URL.replace(/\/$/, '')}/restablecer?token=${encodeURIComponent(rawToken)}`;
      await background(
        c,
        sendImmediate(c.env, {
          userId: user.id,
          email: user.email,
          type: 'PASSWORD_RESET_REQUESTED',
          subject: 'Restablezca su contraseña',
          body: 'Se envió un enlace de recuperación (no se guarda en este registro). Vence en 1 hora.',
          secretBody: `Recibimos una solicitud para restablecer su contraseña.\n\nAbra este enlace (vence en 1 hora y solo funciona una vez):\n${link}\n\nSi usted no lo solicitó, ignore este mensaje; su contraseña no cambiará.`
        })
      );
    }
  }

  return c.json({ success: true, data: { message: 'Si el correo está registrado, se enviaron las instrucciones de recuperación.' } });
});

// 6. Aplicar restablecimiento (token de un solo uso, reclamado atómicamente)
authRoutes.post('/reset-password', async (c) => {
  const body = await readJson(c);
  const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
  const next = assertPassword(body.new_password, 'new_password');
  if (!rawToken) throw badRequest('INVALID_INPUT', 'El enlace de recuperación es obligatorio.');

  const db = c.env.DB;
  const claimed = await db.prepare(
    `UPDATE password_reset_tokens SET used_at = datetime('now')
     WHERE token_hash = ? AND used_at IS NULL AND julianday(expires_at) > julianday('now')
     RETURNING user_id`
  ).bind(await hashToken(rawToken)).first<{ user_id: string }>();
  if (!claimed) throw badRequest('INVALID_OR_EXPIRED_TOKEN', 'El enlace de recuperación no es válido o ya expiró.');

  const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(claimed.user_id).first<{ email: string }>();
  await db.batch([
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").bind(await hashPassword(next), claimed.user_id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(claimed.user_id),
    enqueueStatement(db, {
      userId: claimed.user_id,
      email: user?.email ?? '',
      type: 'PASSWORD_CHANGED',
      subject: 'Aviso de seguridad: su contraseña ha sido restablecida',
      body: 'Su contraseña se restableció mediante el enlace de recuperación. Si usted no lo realizó, comuníquese de inmediato con la administración.'
    }),
    auditStatement(db, { userId: claimed.user_id, action: 'PASSWORD_RESET_COMPLETED', entityType: 'USER', entityId: claimed.user_id, ipAddress: clientIp(c) })
  ]);

  return c.json({ success: true, data: { message: 'Contraseña restablecida correctamente.' } });
});

// 7. Configurar MFA (administrador). No sobrescribe un MFA ya activo.
authRoutes.post('/admin/mfa/setup', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Solo administradores pueden configurar MFA.');
  if (user.mfa_enabled === 1) {
    throw conflict('MFA_ALREADY_ENABLED', 'El MFA ya está activo. Para cambiar de dispositivo siga el procedimiento de restablecimiento documentado.');
  }

  const secret = generateBase32Secret();
  await c.env.DB.prepare('UPDATE users SET mfa_pending_secret = ? WHERE id = ?').bind(secret, user.id).run();
  const issuer = encodeURIComponent('Pimex Fortex Capital');
  return c.json({
    success: true,
    data: { secret, otpauth_url: `otpauth://totp/${issuer}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30` }
  });
});

// 8. Verificar y activar MFA (administrador)
authRoutes.post('/admin/mfa/verify', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Solo administradores pueden activar MFA.');
  const body = await readJson(c);
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  const db = c.env.DB;
  const row = await db.prepare('SELECT mfa_pending_secret FROM users WHERE id = ?').bind(user.id).first<{ mfa_pending_secret: string | null }>();
  if (!row?.mfa_pending_secret) throw badRequest('MFA_NOT_INITIALIZED', 'Inicie primero la configuración de MFA.');

  const counter = await matchTotpCounter(row.mfa_pending_secret, token, 1, 0);
  if (counter === null) throw badRequest('MFA_INVALID', 'Código incorrecto.');

  await db.batch([
    db.prepare(
      'UPDATE users SET mfa_secret = mfa_pending_secret, mfa_pending_secret = NULL, mfa_enabled = 1, mfa_last_counter = ? WHERE id = ? AND mfa_pending_secret IS NOT NULL'
    ).bind(counter, user.id),
    auditStatement(db, { userId: user.id, action: 'ADMIN_MFA_ENABLED', entityType: 'USER', entityId: user.id, ipAddress: clientIp(c) })
  ]);
  return c.json({ success: true, data: { message: 'MFA activado exitosamente.' } });
});
