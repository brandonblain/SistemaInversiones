// Servicio de Avisos por Correo Electrónico
// Reglas: los correos NO incluyen saldos ni montos; cada envío queda registrado con intentos y error.
import type { Env } from '../index';
import { generateSecureToken } from './crypto';

export type NotificationEventType =
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PAYMENT_RECORDED'
  | 'DOCUMENT_UPLOADED'
  | 'CONTRACT_EXPIRING_SOON';

export interface SendEmailPayload {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export type EmailSender = (payload: SendEmailPayload) => Promise<{ success: boolean; error?: string }>;

export const MAX_ATTEMPTS = 3;
const FOOTER = '\n\nEste es un aviso automático de su portal privado de clientes. No responda a este mensaje.';
/** Política de contenido: ningún correo puede llevar importes. */
const MONEY_PATTERN = /\$\s*\d|\d+\s*(MXN|pesos|centavos)/i;

/**
 * Proveedor de correo según configuración:
 * - "resend": API HTTP (requiere EMAIL_API_KEY y dominio remitente verificado).
 * - "log" (predeterminado): solo registra en consola fuera de producción; en producción falla para no
 *   marcar como "enviado" algo que nunca salió.
 */
export function getEmailSender(env: Env): EmailSender {
  const provider = (env.EMAIL_PROVIDER || 'log').toLowerCase();
  if (provider === 'resend') {
    return async (p) => {
      if (!env.EMAIL_API_KEY) return { success: false, error: 'EMAIL_API_KEY no configurada' };
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: p.from, to: [p.to], subject: p.subject, text: p.text })
      });
      return res.ok ? { success: true } : { success: false, error: `Proveedor respondió ${res.status}` };
    };
  }
  return async (p) => {
    if (env.ENVIRONMENT === 'production') return { success: false, error: 'EMAIL_PROVIDER_NOT_CONFIGURED' };
    console.log(`[EMAIL:log] para=${maskEmail(p.to)} asunto="${p.subject}"`);
    return { success: true };
  };
}

function maskEmail(email: string) {
  const [user = '', domain = ''] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

export interface EnqueueInput {
  userId: string;
  email: string;
  type: NotificationEventType;
  subject: string;
  body: string;
  investmentId?: string | null;
}

/** Sentencia para encolar un aviso dentro del mismo lote que la operación que lo origina. */
export function enqueueStatement(db: D1Database, n: EnqueueInput): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview, investment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(generateSecureToken('not'), n.userId, n.type, n.email, n.subject, n.body, n.investmentId ?? null);
}

/**
 * Envía de inmediato un correo cuyo cuerpo contiene un secreto (enlace de recuperación).
 * En la base solo se guarda una vista previa SIN el secreto.
 */
export async function sendImmediate(env: Env, n: EnqueueInput & { secretBody: string }, sender: EmailSender = getEmailSender(env)) {
  const id = generateSecureToken('not');
  await env.DB.prepare(
    `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview, investment_id, attempts_count, last_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
  ).bind(id, n.userId, n.type, n.email, n.subject, n.body, n.investmentId ?? null).run();

  let result: { success: boolean; error?: string };
  try {
    result = await sender({ to: n.email, from: env.EMAIL_FROM, subject: n.subject, text: n.secretBody + FOOTER });
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : 'Error de envío' };
  }
  // Los correos con secreto no se reintentan desde la cola (el secreto no está guardado): fallan definitivamente.
  await env.DB.prepare('UPDATE notification_events SET status = ?, error_message = ? WHERE id = ?')
    .bind(result.success ? 'SENT' : 'FAILED', result.success ? null : (result.error ?? 'Fallo de entrega').slice(0, 300), id)
    .run();
  return result;
}

/**
 * Procesa la cola con reclamo atómico (UPDATE condicional): dos ejecuciones simultáneas
 * (cron + botón manual) nunca envían el mismo aviso dos veces.
 */
export async function processNotificationQueue(
  env: Env,
  sender: EmailSender = getEmailSender(env)
): Promise<{ processed: number; successful: number; failed: number }> {
  const pending = await env.DB.prepare(
    `SELECT id, recipient_email, subject, body_preview, attempts_count
     FROM notification_events
     WHERE status = 'PENDING' AND attempts_count < ?
     ORDER BY created_at ASC
     LIMIT 20`
  ).bind(MAX_ATTEMPTS).all<{ id: string; recipient_email: string; subject: string; body_preview: string; attempts_count: number }>();

  let successful = 0;
  let failed = 0;
  let processed = 0;

  for (const item of pending.results) {
    const claim = await env.DB.prepare(
      `UPDATE notification_events SET attempts_count = attempts_count + 1, last_attempt_at = datetime('now')
       WHERE id = ? AND status = 'PENDING' AND attempts_count = ?`
    ).bind(item.id, item.attempts_count).run();
    if ((claim.meta?.changes ?? 0) !== 1) continue; // otro proceso lo tomó
    processed++;
    const attempts = item.attempts_count + 1;

    let result: { success: boolean; error?: string };
    if (MONEY_PATTERN.test(item.subject) || MONEY_PATTERN.test(item.body_preview)) {
      result = { success: false, error: 'CONTENT_POLICY: el aviso contiene importes' };
    } else {
      try {
        result = await sender({ to: item.recipient_email, from: env.EMAIL_FROM, subject: item.subject, text: item.body_preview + FOOTER });
      } catch (err) {
        result = { success: false, error: err instanceof Error ? err.message : 'Error de envío' };
      }
    }

    if (result.success) {
      await env.DB.prepare("UPDATE notification_events SET status = 'SENT', error_message = NULL WHERE id = ?").bind(item.id).run();
      successful++;
    } else {
      const terminal = attempts >= MAX_ATTEMPTS || result.error?.startsWith('CONTENT_POLICY');
      await env.DB.prepare('UPDATE notification_events SET status = ?, error_message = ? WHERE id = ?')
        .bind(terminal ? 'FAILED' : 'PENDING', (result.error ?? 'Fallo de entrega').slice(0, 300), item.id)
        .run();
      failed++;
    }
  }

  return { processed, successful, failed };
}
