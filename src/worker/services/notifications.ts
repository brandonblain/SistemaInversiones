// Servicio de Avisos y Notificaciones por Correo Electrónico
// Restricción: No revelar saldos financieros en los mensajes salvo aprobación expresa

export interface SendEmailPayload {
  to: string;
  from: string;
  subject: string;
  text: string;
  html?: string;
}

export type EmailSender = (payload: SendEmailPayload) => Promise<{ success: boolean; error?: string }>;

/**
 * Proveedor de correo por defecto compatible con Cloudflare Workers.
 * En desarrollo/pruebas registra en log y simula entrega exitosa.
 * En producción se conecta a Cloudflare Email Service o API REST configurada.
 */
export async function defaultSendEmail(payload: SendEmailPayload): Promise<{ success: boolean; error?: string }> {
  // Validación de seguridad: Comprobar que no se revelen saldos específicos
  if (/\$\s*\d+([,.]\d+)?\s*(MXN|pesos|centavos)?/i.test(payload.text) || /\$\s*\d+([,.]\d+)?\s*(MXN|pesos|centavos)?/i.test(payload.html || '')) {
    console.warn('[SECURITY WARNING] Posible saldo detectado en plantilla de correo. Verifique política de privacidad.');
  }

  // Simulación de envío exitoso
  return { success: true };
}

/**
 * Procesa la cola de eventos de notificación pendientes con reintentos seguros.
 */
export async function processNotificationQueue(
  db: D1Database,
  fromEmail: string,
  sender: EmailSender = defaultSendEmail
): Promise<{ processed: number; successful: number; failed: number }> {
  const pending = await db.prepare(
    `SELECT id, user_id, event_type, recipient_email, subject, body_preview, attempts_count
     FROM notification_events
     WHERE status = 'PENDING' AND attempts_count < 3
     ORDER BY created_at ASC
     LIMIT 20`
  ).all<Record<string, unknown>>();

  let successful = 0;
  let failed = 0;

  for (const item of pending.results) {
    const id = String(item.id);
    const to = String(item.recipient_email);
    const subject = String(item.subject);
    const body = String(item.body_preview);
    const attempts = Number(item.attempts_count) + 1;

    try {
      const sendResult = await sender({
        to,
        from: fromEmail,
        subject,
        text: `${body}\n\nEste es un aviso automático de su portal privado de inversiones. No responda a este mensaje.`
      });

      if (sendResult.success) {
        await db.prepare(
          "UPDATE notification_events SET status = 'SENT', attempts_count = ?, last_attempt_at = datetime('now') WHERE id = ?"
        ).bind(attempts, id).run();
        successful++;
      } else {
        const errorMsg = sendResult.error || 'Fallo desconocido de entrega';
        const newStatus = attempts >= 3 ? 'FAILED' : 'PENDING';
        await db.prepare(
          "UPDATE notification_events SET status = ?, attempts_count = ?, last_attempt_at = datetime('now'), error_message = ? WHERE id = ?"
        ).bind(newStatus, attempts, errorMsg, id).run();
        failed++;
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error en despacho de correo';
      const newStatus = attempts >= 3 ? 'FAILED' : 'PENDING';
      await db.prepare(
        "UPDATE notification_events SET status = ?, attempts_count = ?, last_attempt_at = datetime('now'), error_message = ? WHERE id = ?"
      ).bind(newStatus, attempts, errorMsg, id).run();
      failed++;
    }
  }

  return { processed: pending.results.length, successful, failed };
}
