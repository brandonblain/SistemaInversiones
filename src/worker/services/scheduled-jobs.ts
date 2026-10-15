// Manejador de Trabajos Programados (Cron Triggers)
// Restricción: SIN confirmar pagos ni movimientos irreversibles sin intervención administrativa
import { generateSecureToken } from './crypto';
import { calculateYieldDeterministic, getNextPeriodDates } from './yield-calculator';
import { processNotificationQueue } from './notifications';

export interface ScheduledJobResult {
  jobId: string;
  status: 'SUCCESS' | 'FAILED';
  expiringContractsFound: number;
  previewsGenerated: number;
  emailsProcessed: number;
  details: Record<string, unknown>;
}

export async function runScheduledMaintenance(
  db: D1Database,
  fromEmail = 'avisos@portal-inversionistas.privado'
): Promise<ScheduledJobResult> {
  const jobId = generateSecureToken('job');

  await db.prepare(
    "INSERT INTO scheduled_job_runs (id, job_name, started_at, status) VALUES (?, 'DAILY_MAINTENANCE', datetime('now'), 'RUNNING')"
  ).bind(jobId).run();

  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0] || '';
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || '';

    // 1. Detectar contratos próximos a vencer (en los próximos 30 días)
    const expiringInvestments = await db.prepare(
      `SELECT i.id, i.code, i.maturity_date, i.investor_user_id, u.email
       FROM investments i
       JOIN users u ON i.investor_user_id = u.id
       WHERE i.status = 'ACTIVE' AND i.maturity_date >= ? AND i.maturity_date <= ?`
    ).bind(todayStr, in30Days).all<Record<string, unknown>>();

    let expiringContractsFound = 0;
    for (const inv of expiringInvestments.results) {
      // Verificar si ya se envió aviso en los últimos 15 días
      const recentNotice = await db.prepare(
        `SELECT id FROM notification_events
         WHERE user_id = ? AND event_type = 'CONTRACT_EXPIRING_SOON' AND created_at >= datetime('now', '-15 days')`
      ).bind(inv.investor_user_id).first();

      if (!recentNotice) {
        await db.prepare(
          `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview)
           VALUES (?, ?, 'CONTRACT_EXPIRING_SOON', ?, 'Aviso de próximo vencimiento de inversión', ?)`
        ).bind(
          generateSecureToken('not'),
          inv.investor_user_id,
          inv.email,
          `Le informamos que su inversión ${inv.code} concluirá su plazo contractual el ${inv.maturity_date}. Puede consultar sus opciones de renovación o retiro en el portal privado.`
        ).run();
        expiringContractsFound++;
      }
    }

    // 2. Generar PREVISUALIZACIONES informativas de rendimientos del siguiente periodo
    // IMPORTANTE: NO se persiste ningún devengo confirmado ni movimiento monetario sin acción manual del admin.
    const activeInvestments = await db.prepare(
      `SELECT i.id, i.code, i.start_date, i.maturity_date, i.current_capital_cents,
              t.fixed_annual_rate_bps, t.payout_frequency, t.day_count_convention
       FROM investments i
       JOIN investment_terms t ON i.id = t.investment_id AND t.effective_to IS NULL
       WHERE i.status = 'ACTIVE'`
    ).all<Record<string, unknown>>();

    const calculationPreviews: Array<Record<string, unknown>> = [];
    for (const inv of activeInvestments.results) {
      // Obtener última fecha calculada
      const lastYield = await db.prepare(
        "SELECT MAX(period_end) as last_end FROM yield_entries WHERE investment_id = ? AND status = 'CONFIRMED'"
      ).bind(inv.id).first<{ last_end: string | null }>();

      const startDate = lastYield?.last_end || String(inv.start_date);
      const nextPeriod = getNextPeriodDates(
        startDate,
        inv.payout_frequency as 'MONTHLY' | 'SEMIANNUAL' | 'AT_MATURITY',
        String(inv.maturity_date)
      );

      if (nextPeriod.periodStart < nextPeriod.periodEnd) {
        const preview = calculateYieldDeterministic({
          capitalCents: Number(inv.current_capital_cents),
          rateBps: Number(inv.fixed_annual_rate_bps),
          startDate: nextPeriod.periodStart,
          endDate: nextPeriod.periodEnd,
          convention: inv.day_count_convention as 'ACT_365' | 'ACT_360' | 'THIRTY_360'
        });

        calculationPreviews.push({
          investment_id: inv.id,
          code: inv.code,
          preview_period_start: preview.periodStart,
          preview_period_end: preview.periodEnd,
          days: preview.daysCount,
          suggested_yield_cents: preview.yieldCents
        });
      }
    }

    // 3. Procesar cola de correos pendientes
    const emailResult = await processNotificationQueue(db, fromEmail);

    const details = {
      expiringContractsFound,
      previewsCount: calculationPreviews.length,
      previews: calculationPreviews,
      emailQueue: emailResult,
      executedAt: new Date().toISOString()
    };

    await db.prepare(
      "UPDATE scheduled_job_runs SET status = 'SUCCESS', completed_at = datetime('now'), details_json = ? WHERE id = ?"
    ).bind(JSON.stringify(details), jobId).run();

    return {
      jobId,
      status: 'SUCCESS',
      expiringContractsFound,
      previewsGenerated: calculationPreviews.length,
      emailsProcessed: emailResult.processed,
      details
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error desconocido en job programado';
    await db.prepare(
      "UPDATE scheduled_job_runs SET status = 'FAILED', completed_at = datetime('now'), details_json = ? WHERE id = ?"
    ).bind(JSON.stringify({ error: errorMsg }), jobId).run();

    return {
      jobId,
      status: 'FAILED',
      expiringContractsFound: 0,
      previewsGenerated: 0,
      emailsProcessed: 0,
      details: { error: errorMsg }
    };
  }
}
