import { describe, expect, it, vi } from 'vitest';
import { addDays, todayInContractZone } from '../../src/worker/lib/dates';
import { enqueueStatement, getEmailSender, processNotificationQueue } from '../../src/worker/services/notifications';
import { runScheduledMaintenance } from '../../src/worker/services/scheduled-jobs';
import { makeEnv, seedAdmin, seedInvestor } from '../helpers/app';

async function seedInvestment(env: ReturnType<typeof makeEnv>, id: string, userId: string, start: string, maturity: string) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO investments (id, investor_user_id, code, investment_type, business_line, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents)
       VALUES (?, ?, ?, 'FAST_FOOD', 'FOOD_TRUCKS', 'MXN', ?, ?, 10000000, 10000000)`
    ).bind(id, userId, `FICT-${id}`, start, maturity),
    env.DB.prepare(
      `INSERT INTO investment_terms (id, investment_id, rate_type, fixed_annual_rate_bps, payout_frequency, effective_from) VALUES (?, ?, 'FIXED', 1300, 'MONTHLY', ?)`
    ).bind(`t_${id}`, id, start),
    env.DB.prepare(
      `INSERT INTO capital_movements (id, investment_id, movement_type, amount_cents, effective_date, recorded_by_user_id)
       VALUES (?, ?, 'INITIAL_DEPOSIT', 10000000, ?, 'usr_admin')`
    ).bind(`m_${id}`, id, start)
  ]);
}

describe('Avisos por correo', () => {
  it('reclamo atómico: dos procesos simultáneos no envían el mismo aviso dos veces', async () => {
    const env = makeEnv();
    const uid = await seedInvestor(env, { email: 'victoria.perez@ficticio.test' });
    await enqueueStatement(env.DB, { userId: uid, email: 'victoria.perez@ficticio.test', type: 'PAYMENT_RECORDED', subject: 'Pago registrado', body: 'Se registró un pago.' }).run();
    const sender = vi.fn(async () => ({ success: true }));
    const [a, b] = await Promise.all([processNotificationQueue(env, sender), processNotificationQueue(env, sender)]);
    expect(sender).toHaveBeenCalledTimes(1);
    expect(a.successful + b.successful).toBe(1);
  });

  it('reintentos hasta 3 y luego FAILED con el error registrado', async () => {
    const env = makeEnv();
    const uid = await seedInvestor(env);
    await enqueueStatement(env.DB, { userId: uid, email: 'x@ficticio.test', type: 'PASSWORD_CHANGED', subject: 'Aviso', body: 'Cambio de contraseña.' }).run();
    const sender = vi.fn(async () => ({ success: false, error: 'Buzón no disponible' }));
    for (let i = 0; i < 4; i++) await processNotificationQueue(env, sender);
    expect(sender).toHaveBeenCalledTimes(3);
    const row = await env.DB.prepare('SELECT status, attempts_count, error_message FROM notification_events').first<any>();
    expect(row).toMatchObject({ status: 'FAILED', attempts_count: 3, error_message: 'Buzón no disponible' });
  });

  it('política de contenido: un aviso con importes nunca se envía', async () => {
    const env = makeEnv();
    const uid = await seedInvestor(env);
    await enqueueStatement(env.DB, { userId: uid, email: 'x@ficticio.test', type: 'PAYMENT_RECORDED', subject: 'Pago', body: 'Se pagaron $5,000.00 MXN' }).run();
    const sender = vi.fn(async () => ({ success: true }));
    await processNotificationQueue(env, sender);
    expect(sender).not.toHaveBeenCalled();
    expect((await env.DB.prepare('SELECT status FROM notification_events').first<any>()).status).toBe('FAILED');
  });

  it('en producción sin proveedor configurado NO se marca como enviado', async () => {
    const env = makeEnv({ ENVIRONMENT: 'production' });
    expect(await getEmailSender(env)({ to: 'a@ficticio.test', from: 'b@ficticio.test', subject: 's', text: 't' })).toEqual({ success: false, error: 'EMAIL_PROVIDER_NOT_CONFIGURED' });
  });
});

describe('Trabajo programado', () => {
  it('aviso de vencimiento por inversión (dos inversiones del mismo cliente → dos avisos), sin duplicar en 15 días', async () => {
    const env = makeEnv();
    await seedAdmin(env);
    const uid = await seedInvestor(env, { email: 'hector.galeana@ficticio.test' });
    const today = todayInContractZone();
    await seedInvestment(env, 'a', uid, addDays(today, -300), addDays(today, 10));
    await seedInvestment(env, 'b', uid, addDays(today, -300), addDays(today, 20));
    await seedInvestment(env, 'c', uid, addDays(today, -300), addDays(today, 90));
    const sender = vi.fn(async () => ({ success: true }));
    const r1 = await runScheduledMaintenance(env, sender);
    expect(r1.status).toBe('SUCCESS');
    expect(r1.expiringContractsFound).toBe(2);
    const r2 = await runScheduledMaintenance(env, sender);
    expect(r2.expiringContractsFound).toBe(0);
    const bodies = await env.DB.prepare("SELECT body_preview FROM notification_events WHERE event_type = 'CONTRACT_EXPIRING_SOON'").all<{ body_preview: string }>();
    expect(bodies.results).toHaveLength(2);
    for (const b of bodies.results) expect(b.body_preview).not.toMatch(/\$|MXN|retiro/i);
  });

  it('solo genera vistas previas: nunca confirma rendimientos ni mueve capital', async () => {
    const env = makeEnv();
    await seedAdmin(env);
    const uid = await seedInvestor(env);
    const today = todayInContractZone();
    await seedInvestment(env, 'p', uid, addDays(today, -70), addDays(today, 300));
    const r = await runScheduledMaintenance(env, vi.fn(async () => ({ success: true })));
    expect(r.previewsGenerated).toBeGreaterThan(0);
    expect((r.details.previews as any[])[0].suggested_yield_cents).toBeGreaterThan(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM yield_entries').first<{ n: number }>())?.n).toBe(0);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM capital_movements').first<{ n: number }>())?.n).toBe(1);
  });
});
