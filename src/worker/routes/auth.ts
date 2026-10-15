// Rutas de Autenticación, MFA, Cambio y Recuperación de Contraseña
import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import {
  hashPassword,
  verifyPassword,
  generateSecureToken,
  hashToken,
  generateBase32Secret,
  verifyTotpCode
} from '../services/crypto';
import { recordAuditLog } from '../services/audit';
import { authMiddleware, AuthenticatedUser, InvestorProfile } from '../middleware/auth';
import type { Env } from '../index';

export const authRoutes = new Hono<{
  Bindings: Env;
  Variables: {
    user: AuthenticatedUser;
    profile: InvestorProfile | null;
    sessionId: string;
  };
}>();

// 1. Inicio de Sesión
authRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.email || !body.password) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Correo y contraseña requeridos.' } }, 400);
  }

  const email = String(body.email).toLowerCase().trim();
  const password = String(body.password);
  const mfaToken = body.mfa_token ? String(body.mfa_token).trim() : null;

  const userRow = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.role, u.is_active, u.mfa_secret, u.mfa_enabled,
            p.id as profile_id, p.full_name, p.rfc, p.phone, p.address
     FROM users u
     LEFT JOIN investor_profiles p ON u.id = p.user_id
     WHERE u.email = ?`
  ).bind(email).first<Record<string, unknown>>();

  if (!userRow) {
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' } }, 401);
  }

  if (Number(userRow.is_active) !== 1) {
    return c.json({ success: false, error: { code: 'ACCOUNT_INACTIVE', message: 'Cuenta deshabilitada.' } }, 403);
  }

  const isValidPassword = await verifyPassword(password, String(userRow.password_hash));
  if (!isValidPassword) {
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas.' } }, 401);
  }

  // Verificación de MFA para Administradores
  const isMfaEnabled = Number(userRow.mfa_enabled) === 1;
  if (userRow.role === 'ADMIN' && isMfaEnabled) {
    if (!mfaToken) {
      return c.json({
        success: false,
        error: { code: 'MFA_REQUIRED', message: 'Se requiere código de autenticación de dos factores (MFA).' }
      }, 401);
    }

    const secret = String(userRow.mfa_secret || '');
    const isTotpValid = await verifyTotpCode(secret, mfaToken);
    if (!isTotpValid) {
      return c.json({
        success: false,
        error: { code: 'MFA_INVALID', message: 'Código MFA incorrecto o expirado.' }
      }, 401);
    }
  }

  // Crear sesión
  const sessionToken = generateSecureToken('ses');
  const tokenHashed = await hashToken(sessionToken);
  const sessionId = generateSecureToken('sid');
  // 30 días de duración
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || null;
  const userAgent = c.req.header('user-agent') || null;

  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(sessionId, userRow.id, tokenHashed, expiresAt, ip, userAgent).run();

  setCookie(c, 'auth_session', sessionToken, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT !== 'development',
    sameSite: 'Strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60
  });

  await recordAuditLog(c.env.DB, {
    userId: String(userRow.id),
    action: 'USER_LOGIN',
    entityType: 'USER',
    entityId: String(userRow.id),
    ipAddress: ip,
    userAgent
  });

  return c.json({
    success: true,
    data: {
      token: sessionToken, // Para soporte de testing / API clients
      user: {
        id: String(userRow.id),
        email: String(userRow.email),
        role: userRow.role,
        is_active: true,
        mfa_enabled: isMfaEnabled
      },
      investor_profile: userRow.profile_id
        ? {
            id: String(userRow.profile_id),
            full_name: String(userRow.full_name),
            rfc: userRow.rfc ? String(userRow.rfc) : null,
            phone: userRow.phone ? String(userRow.phone) : null
          }
        : null
    }
  });
});

// 2. Cerrar Sesión
authRoutes.post('/logout', authMiddleware, async (c) => {
  const sessionId = c.get('sessionId');
  const user = c.get('user');

  await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  deleteCookie(c, 'auth_session', { path: '/' });

  await recordAuditLog(c.env.DB, {
    userId: user.id,
    action: 'USER_LOGOUT',
    entityType: 'USER',
    entityId: user.id
  });

  return c.json({ success: true, data: { message: 'Sesión finalizada exitosamente.' } });
});

// 3. Obtener Usuario Actual
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
        mfa_enabled: Boolean(user.mfa_enabled)
      },
      investor_profile: profile
    }
  });
});

// 4. Cambio de Contraseña (Permitido al Inversionista)
authRoutes.post('/change-password', authMiddleware, async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.current_password || !body.new_password) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Contraseña actual y nueva requeridas.' } }, 400);
  }

  const currentPassword = String(body.current_password);
  const newPassword = String(body.new_password);

  if (newPassword.length < 8) {
    return c.json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'La nueva contraseña debe tener al menos 8 caracteres.' } }, 400);
  }

  // Verificar contraseña actual en base de datos
  const userDb = await c.env.DB.prepare(
    'SELECT password_hash FROM users WHERE id = ?'
  ).bind(user.id).first<{ password_hash: string }>();

  if (!userDb || !(await verifyPassword(currentPassword, userDb.password_hash))) {
    return c.json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'La contraseña actual no es correcta.' } }, 400);
  }

  const newHash = await hashPassword(newPassword);
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, user.id).run();

  // Registrar notificación para aviso por correo
  await c.env.DB.prepare(
    `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview)
     VALUES (?, ?, 'PASSWORD_CHANGED', ?, 'Aviso de seguridad: Su contraseña ha sido modificada', 'Se ha registrado un cambio exitoso de contraseña en su cuenta del portal privado.')`
  ).bind(generateSecureToken('not'), user.id, user.email).run();

  await recordAuditLog(c.env.DB, {
    userId: user.id,
    action: 'PASSWORD_CHANGED',
    entityType: 'USER',
    entityId: user.id
  });

  return c.json({ success: true, data: { message: 'Contraseña actualizada exitosamente.' } });
});

// 5. Solicitud de Recuperación de Contraseña
authRoutes.post('/request-password-reset', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.email) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Correo requerido.' } }, 400);
  }

  const email = String(body.email).toLowerCase().trim();
  const user = await c.env.DB.prepare(
    'SELECT id, email, is_active FROM users WHERE email = ?'
  ).bind(email).first<{ id: string; email: string; is_active: number }>();

  // Respuesta constante para prevenir enumeración de usuarios
  if (user && Number(user.is_active) === 1) {
    const rawToken = generateSecureToken('rst');
    const tokenHashed = await hashToken(rawToken);
    const tokenId = generateSecureToken('tok');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

    await c.env.DB.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`
    ).bind(tokenId, user.id, tokenHashed, expiresAt).run();

    // Registrar evento de notificación
    await c.env.DB.prepare(
      `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview)
       VALUES (?, ?, 'PASSWORD_RESET_REQUESTED', ?, 'Solicitud para restablecer su contraseña', 'Ha solicitado restablecer su contraseña. Utilice el enlace seguro proporcionado.')`
    ).bind(generateSecureToken('not'), user.id, user.email).run();

    await recordAuditLog(c.env.DB, {
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      entityType: 'USER',
      entityId: user.id
    });
  }

  return c.json({
    success: true,
    data: { message: 'Si el correo está registrado, se enviaron las instrucciones de recuperación.' }
  });
});

// 6. Aplicar Restablecimiento de Contraseña
authRoutes.post('/reset-password', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.token || !body.new_password) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Token y nueva contraseña requeridos.' } }, 400);
  }

  const rawToken = String(body.token).trim();
  const newPassword = String(body.new_password);

  if (newPassword.length < 8) {
    return c.json({ success: false, error: { code: 'WEAK_PASSWORD', message: 'La contraseña debe tener al menos 8 caracteres.' } }, 400);
  }

  const tokenHashed = await hashToken(rawToken);

  const resetRow = await c.env.DB.prepare(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`
  ).bind(tokenHashed).first<{ id: string; user_id: string }>();

  if (!resetRow) {
    return c.json({ success: false, error: { code: 'INVALID_OR_EXPIRED_TOKEN', message: 'Token inválido o expirado.' } }, 400);
  }

  const newHash = await hashPassword(newPassword);

  // Invalidar token y actualizar contraseña
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, resetRow.user_id).run();

  await c.env.DB.prepare(
    "UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?"
  ).bind(resetRow.id).run();

  // Invalidar sesiones existentes por seguridad
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(resetRow.user_id).run();

  await recordAuditLog(c.env.DB, {
    userId: resetRow.user_id,
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'USER',
    entityId: resetRow.user_id
  });

  return c.json({ success: true, data: { message: 'Contraseña restablecida correctamente.' } });
});

// 7. Configuración MFA Administrador (Setup)
authRoutes.post('/admin/mfa/setup', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'ADMIN') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo administradores pueden configurar MFA.' } }, 403);
  }

  const secretBase32 = generateBase32Secret(20);
  // Guardar secret temporal en la cuenta
  await c.env.DB.prepare(
    'UPDATE users SET mfa_secret = ? WHERE id = ?'
  ).bind(secretBase32, user.id).run();

  const appName = encodeURIComponent('Portal Inversionistas Privado');
  const otpauthUrl = `otpauth://totp/${appName}:${encodeURIComponent(user.email)}?secret=${secretBase32}&issuer=${appName}`;

  return c.json({
    success: true,
    data: {
      secret: secretBase32,
      otpauth_url: otpauthUrl
    }
  });
});

// 8. Verificación y Activación MFA Administrador
authRoutes.post('/admin/mfa/verify', authMiddleware, async (c) => {
  const user = c.get('user');
  if (user.role !== 'ADMIN') {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Solo administradores pueden activar MFA.' } }, 403);
  }

  const body = await c.req.json().catch(() => null);
  if (!body || !body.token) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Código token MFA requerido.' } }, 400);
  }

  const userRow = await c.env.DB.prepare(
    'SELECT mfa_secret FROM users WHERE id = ?'
  ).bind(user.id).first<{ mfa_secret: string | null }>();

  if (!userRow || !userRow.mfa_secret) {
    return c.json({ success: false, error: { code: 'MFA_NOT_INITIALIZED', message: 'Inicie primero la configuración de MFA.' } }, 400);
  }

  const isValid = await verifyTotpCode(userRow.mfa_secret, String(body.token).trim());
  if (!isValid) {
    return c.json({ success: false, error: { code: 'MFA_INVALID', message: 'Código MFA incorrecto.' } }, 400);
  }

  await c.env.DB.prepare(
    'UPDATE users SET mfa_enabled = 1 WHERE id = ?'
  ).bind(user.id).run();

  await recordAuditLog(c.env.DB, {
    userId: user.id,
    action: 'ADMIN_MFA_ENABLED',
    entityType: 'USER',
    entityId: user.id
  });

  return c.json({ success: true, data: { message: 'MFA activado exitosamente para el administrador.' } });
});
