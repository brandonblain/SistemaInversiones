// Trabajo programado diario (Cron Trigger).
// Restricción: SOLO genera previsualizaciones y avisos; NUNCA confirma rendimientos, pagos ni movimientos.
import type { Env } from '../index';
import { addDays, todayInContractZone } from '../lib/dates';
import { generateSecureToken } from './crypto';
import { enqueueStatement, processNotificationQueue, type EmailSender } from './notifications';
import { previewYield } from './payment-ledger';
import { getNextPeriodDates, type PayoutFrequency } from './yield-calculator';

export interface ScheduledJobResult {
  jobId: string;
  status: 'SUCCESS' | 'FAILED';
  expiringContractsFound: number;
  previewsGenerated: number;
  emailsProcessed: number;
  details: Record<string, unknown>;
}

export async function runScheduledMaintenance(env: Env, sender?: EmailSender): Promise<ScheduledJobResult> {
  const db = env.DB;
  const jobId = generateSecureToken('job');
  await db.prepare("INSERT INTO scheduled_job_runs (id, job_name, status) VALUES (?, 'DAILY_MAINTENANCE', 'RUNNING')").bind(jobId).run();

  try {
    const today = todayInContractZone();
    const in30 = addDays(today, 30);

    // 1. Avisos de vencimiento: uno por inversión cada 15 días como máximo.
    const expiring = await db
      .prepare(
        `SELECT i.id, i.code, i.maturity_date, i.investor_user_id, u.email
         FROM investments i JOIN users u ON u.id = i.investor_user_id
         WHERE i.status = 'ACTIVE' AND u.is_active = 1 AND i.maturity_date >= ? AND i.maturity_date <= ?
           AND NOT EXISTS (
             SELECT 1 FROM notification_events n
             WHERE n.investment_id = i.id AND n.event_type = 'CONTRACT_EXPIRING_SOON'
               AND julianday(n.created_at) > julianday('now', '-15 days'))`
      )
      .bind(today, in30)
      .all<{ id: string; code: string; maturity_date: string; investor_user_id: string; email: string }>();

    if (expiring.results.length) {
      await db.batch(
        expiring.results.map((inv) =>
          enqueueStatement(db, {
            userId: inv.investor_user_id,
            email: inv.email,
            type: 'CONTRACT_EXPIRING_SOON',
            subject: 'Aviso de próximo vencimiento de su inversión',
            body: `Le informamos que su inversión ${inv.code} concluye su plazo contractual el ${inv.maturity_date}. La administración se pondrá en contacto con usted.`,
            investmentId: inv.id
          })
        )
      );
    }

    // 2. Previsualizaciones informativas del siguiente periodo (no se persisten como rendimientos).
    const active = await db
      .prepare(
        `SELECT i.id, i.code, i.start_date, i.maturity_date, t.payout_frequency,
                (SELECT MAX(period_end) FROM yield_entries y WHERE y.investment_id = i.id AND y.status = 'CONFIRMED' AND y.source = 'AUTO') AS last_end
         FROM investments i JOIN investment_terms t ON t.investment_id = i.id AND t.effective_to IS NULL
         WHERE i.status = 'ACTIVE'`
      )
      .all<{ id: string; code: string; start_date: string; maturity_date: string; payout_frequency: PayoutFrequency; last_end: string | null }>();

    const previews: Array<Record<string, unknown>> = [];
    for (const inv of active.results) {
      const from = inv.last_end ?? inv.start_date;
      if (from >= inv.maturity_date) continue;
      const next = getNextPeriodDates(inv.start_date, from, inv.payout_frequency, inv.maturity_date);
      if (next.periodEnd > today) continue; // el periodo aún no termina
      try {
        const p = await previewYield(env, inv.id, next.periodStart, next.periodEnd);
        previews.push({ investment_id: inv.id, code: inv.code, period_start: p.period_start, period_end: p.period_end, suggested_yield_cents: p.calculated_yield_cents });
      } catch (err) {
        previews.push({ investment_id: inv.id, code: inv.code, period_start: next.periodStart, period_end: next.periodEnd, error: err instanceof Error ? err.message : 'error' });
      }
    }

    // 3. Cola de correos
    const emails = await processNotificationQueue(env, sender);

    const details = { expiringContractsFound: expiring.results.length, previewsCount: previews.length, previews, emailQueue: emails, today };
    await db.prepare("UPDATE scheduled_job_runs SET status = 'SUCCESS', completed_at = datetime('now'), details_json = ? WHERE id = ?")
      .bind(JSON.stringify(details), jobId).run();
    return { jobId, status: 'SUCCESS', expiringContractsFound: expiring.results.length, previewsGenerated: previews.length, emailsProcessed: emails.processed, details };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido';
    await db.prepare("UPDATE scheduled_job_runs SET status = 'FAILED', completed_at = datetime('now'), details_json = ? WHERE id = ?")
      .bind(JSON.stringify({ error }), jobId).run();
    return { jobId, status: 'FAILED', expiringContractsFound: 0, previewsGenerated: 0, emailsProcessed: 0, details: { error } };
  }
}
