import { describe, it, expect, beforeEach } from 'vitest';
import { createTestD1Database } from '../helpers/d1-mock';
import { processNotificationQueue, EmailSender } from '../../src/worker/services/notifications';
import { runScheduledMaintenance } from '../../src/worker/services/scheduled-jobs';

describe('Notifications & Scheduled Cron Jobs Suite', () => {
  let db: D1Database;

  beforeEach(async () => {
    db = createTestD1Database();

    // Crear inversionista y usuario
    await db.prepare(
      "INSERT INTO users (id, email, password_hash, role, is_active) VALUES ('u_inv', 'inversionista@privado.test', 'hash', 'INVESTOR', 1)"
    ).run();

    await db.prepare(
      "INSERT INTO investor_profiles (id, user_id, full_name) VALUES ('p_inv', 'u_inv', 'Don Roberto Garza')"
    ).run();

    // Inversión que vence en 20 días (próxima a vencer)
    const today = new Date();
    const in20Days = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await db.prepare(
      `INSERT INTO investments (id, investor_user_id, code, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents)
       VALUES ('inv_expiring', 'u_inv', 'INV-EXP-001', 'ACTIVE', 'MXN', '2025-01-01', ?, 50000000, 50000000)`
    ).bind(in20Days).run();

    await db.prepare(
      `INSERT INTO investment_terms (id, investment_id, fixed_annual_rate_bps, payout_frequency, day_count_convention, effective_from)
       VALUES ('term_exp', 'inv_expiring', 1300, 'MONTHLY', 'ACT_365', '2025-01-01')`
    ).run();
  });

  it('should process notification queue and assert no balances or dollar amounts are leaked', async () => {
    // 1. Insertar notificación de pago registrado
    await db.prepare(
      `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview, status)
       VALUES ('not_1', 'u_inv', 'PAYMENT_RECORDED', 'inversionista@privado.test', 'Aviso de pago registrado', 'Se ha registrado un pago externo en su inversión INV-EXP-001 con referencia SPEI-12345. Consulte su portal.', 'PENDING')`
    ).run();

    const sentEmails: Array<{ to: string; subject: string; text: string }> = [];
    const mockSender: EmailSender = async (payload) => {
      sentEmails.push(payload);
      return { success: true };
    };

    const result = await processNotificationQueue(db, 'avisos@portal.test', mockSender);

    expect(result.processed).toBe(1);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(0);

    expect(sentEmails.length).toBe(1);
    const email = sentEmails[0];
    expect(email?.to).toBe('inversionista@privado.test');
    expect(email?.subject).toBe('Aviso de pago registrado');

    // Regla estricta: NO revelar saldos ni signos de pesos en el correo
    expect(email?.text).not.toMatch(/\$\s*\d+/);
    expect(email?.text).not.toContain('centavos');
    expect(email?.text).not.toContain('50000000');

    // Verificar que en base de datos quedó en estado SENT
    const row = await db.prepare('SELECT status, attempts_count FROM notification_events WHERE id = ?').bind('not_1').first<{ status: string; attempts_count: number }>();
    expect(row?.status).toBe('SENT');
    expect(row?.attempts_count).toBe(1);
  });

  it('should execute scheduled maintenance: detect expiring contracts and generate previews without irreversible changes', async () => {
    // Verificar que antes de la ejecución no hay rendimientos confirmados ni movimientos
    const yieldsBefore = await db.prepare('SELECT COUNT(*) as c FROM yield_entries').first<{ c: number }>();
    expect(yieldsBefore?.c).toBe(0);

    const result = await runScheduledMaintenance(db, 'avisos@portal.test');

    expect(result.status).toBe('SUCCESS');
    expect(result.expiringContractsFound).toBe(1);
    expect(result.previewsGenerated).toBeGreaterThanOrEqual(1);

    // Regla estricta: NO se deben haber generado devengos confirmados en la BD (solo previsualizaciones en details_json)
    const yieldsAfter = await db.prepare('SELECT COUNT(*) as c FROM yield_entries').first<{ c: number }>();
    expect(yieldsAfter?.c).toBe(0);

    // Verificar que el log del job se registró en scheduled_job_runs
    const jobLog = await db.prepare(
      "SELECT job_name, status, details_json FROM scheduled_job_runs WHERE id = ?"
    ).bind(result.jobId).first<{ job_name: string; status: string; details_json: string }>();

    expect(jobLog?.job_name).toBe('DAILY_MAINTENANCE');
    expect(jobLog?.status).toBe('SUCCESS');
    expect(jobLog?.details_json).toContain('INV-EXP-001');

    // Verificar que se encoló la notificación de vencimiento
    const notif = await db.prepare(
      "SELECT subject, body_preview FROM notification_events WHERE event_type = 'CONTRACT_EXPIRING_SOON'"
    ).first<{ subject: string; body_preview: string }>();

    expect(notif?.subject).toContain('Aviso de próximo vencimiento');
  });

  it('should handle delivery failure and increment attempt count until marked FAILED', async () => {
    await db.prepare(
      `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview, status, attempts_count)
       VALUES ('not_fail', 'u_inv', 'PASSWORD_CHANGED', 'fail@test.com', 'Aviso de seguridad', 'Contraseña cambiada', 'PENDING', 2)`
    ).run();

    const failingSender: EmailSender = async () => {
      return { success: false, error: 'SMTP timeout 504' };
    };

    const result = await processNotificationQueue(db, 'avisos@portal.test', failingSender);

    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);

    // Al llegar a 3 intentos, debe pasar a FAILED
    const row = await db.prepare('SELECT status, attempts_count, error_message FROM notification_events WHERE id = ?').bind('not_fail').first<{ status: string; attempts_count: number; error_message: string }>();
    expect(row?.status).toBe('FAILED');
    expect(row?.attempts_count).toBe(3);
    expect(row?.error_message).toContain('SMTP timeout');
  });
});
