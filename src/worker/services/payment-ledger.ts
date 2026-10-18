// Operaciones contables: rendimientos (automáticos y manuales), reversiones, pagos externos y reinversión.
// Cada operación se ejecuta en UN lote de D1 (transacción) junto con su auditoría y su aviso; los triggers
// de la migración 0002 garantizan los invariantes aun con peticiones simultáneas (doble clic, reintentos).
import type { Env } from '../index';
import { AppError, conflict, mapDbError, withDb } from '../lib/errors';
import { contractDateOf, todayInContractZone } from '../lib/dates';
import { auditStatement } from './audit';
import { generateSecureToken } from './crypto';
import { assertNotInsideClosedPeriod, resolveCalculationContext } from './capital-ledger';
import { enqueueStatement } from './notifications';
import { CALCULATION_VERSION, calculateYieldDeterministic } from './yield-calculator';

export const rulesApproved = (env: Env) => env.FINANCIAL_RULES_APPROVED === 'true';

export interface YieldPreview {
  investment_id: string;
  period_start: string;
  period_end: string;
  days_in_period: number;
  capital_cents: number;
  annual_rate_bps: number;
  calculated_yield_cents: number;
  day_count_convention: string;
  calculation_formula: string;
  calculation_version: string;
  /** false mientras el cliente no apruebe por escrito las convenciones de cálculo. */
  rules_approved: boolean;
}

/** Vista previa sin persistir: capital y tasa VIGENTES EN EL PERIODO (no los de hoy). */
export async function previewYield(env: Env, investmentId: string, start: string, end: string): Promise<YieldPreview> {
  const ctx = await resolveCalculationContext(env.DB, investmentId, start, end);
  const calc = calculateYieldDeterministic({ capitalCents: ctx.capitalCents, rateBps: ctx.rateBps, startDate: start, endDate: end, convention: ctx.convention });
  return {
    investment_id: investmentId,
    period_start: start,
    period_end: end,
    days_in_period: calc.daysCount,
    capital_cents: calc.capitalCents,
    annual_rate_bps: calc.rateBps,
    calculated_yield_cents: calc.yieldCents,
    day_count_convention: calc.convention,
    calculation_formula: calc.formulaDescription,
    calculation_version: CALCULATION_VERSION,
    rules_approved: rulesApproved(env)
  };
}

const findAutoYield = (db: D1Database, investmentId: string, start: string, end: string) =>
  db
    .prepare(
      `SELECT id, amount_cents FROM yield_entries
       WHERE investment_id = ? AND period_start = ? AND period_end = ? AND status = 'CONFIRMED' AND source = 'AUTO'`
    )
    .bind(investmentId, start, end)
    .first<{ id: string; amount_cents: number }>();

/**
 * Confirma un devengo automático de forma idempotente.
 * - El servidor recalcula; si `expectedAmountCents` (lo que vio el admin) no coincide, rechaza (los datos cambiaron).
 * - Mismo periodo exacto ya confirmado → devuelve el existente (doble clic / reintento).
 * - Periodo traslapado → 409.
 */
export async function confirmYield(
  env: Env,
  input: { investmentId: string; start: string; end: string; expectedAmountCents: number | null; note: string | null; adminId: string; ip: string | null }
): Promise<{ id: string; isExisting: boolean; amountCents: number }> {
  if (env.ENVIRONMENT === 'production' && !rulesApproved(env)) {
    throw new AppError(423, 'RULES_NOT_APPROVED', 'Las convenciones de cálculo aún no están aprobadas por escrito; no se pueden confirmar rendimientos en producción.');
  }
  const db = env.DB;
  const existing = await findAutoYield(db, input.investmentId, input.start, input.end);
  if (existing) return { id: existing.id, isExisting: true, amountCents: existing.amount_cents };

  const preview = await previewYield(env, input.investmentId, input.start, input.end);
  if (input.expectedAmountCents !== null && input.expectedAmountCents !== preview.calculated_yield_cents) {
    throw conflict('PREVIEW_MISMATCH', 'El cálculo cambió desde la vista previa. Genere una nueva vista previa antes de confirmar.', {
      expected_cents: input.expectedAmountCents,
      calculated_cents: preview.calculated_yield_cents
    });
  }

  const id = generateSecureToken('yid');
  try {
    await db.batch([
      db.prepare(
        `INSERT INTO yield_entries (id, investment_id, period_start, period_end, days_count, reference_capital_cents, rate_bps,
                                    amount_cents, status, source, calculation_version, note, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', 'AUTO', ?, ?, ?)`
      ).bind(
        id, input.investmentId, input.start, input.end, preview.days_in_period, preview.capital_cents, preview.annual_rate_bps,
        preview.calculated_yield_cents, `${CALCULATION_VERSION}:${preview.day_count_convention}`, input.note, input.adminId
      ),
      auditStatement(db, {
        userId: input.adminId,
        action: 'YIELD_CONFIRMED',
        entityType: 'YIELD_ENTRY',
        entityId: id,
        ipAddress: input.ip,
        newValues: {
          investment_id: input.investmentId,
          period_start: input.start,
          period_end: input.end,
          amount_cents: preview.calculated_yield_cents,
          capital_cents: preview.capital_cents,
          rate_bps: preview.annual_rate_bps,
          formula: preview.calculation_formula,
          rules_approved: preview.rules_approved
        }
      })
    ]);
  } catch (err) {
    // Carrera con otra confirmación simultánea del mismo periodo: devolver la que ganó.
    const again = await findAutoYield(db, input.investmentId, input.start, input.end);
    if (again) return { id: again.id, isExisting: true, amountCents: again.amount_cents };
    throw mapDbError(err) ?? err;
  }
  return { id, isExisting: false, amountCents: preview.calculated_yield_cents };
}

/** Rendimiento manual o ajuste (positivo o negativo), con motivo obligatorio. Puede coexistir con el automático. */
export async function recordManualYield(
  env: Env,
  input: { investmentId: string; start: string; end: string; amountCents: number; reason: string; adminId: string; ip: string | null }
): Promise<{ id: string }> {
  if (input.amountCents === 0) throw new AppError(400, 'INVALID_INPUT', 'El importe del ajuste no puede ser cero.');
  const ctx = await resolveCalculationContext(env.DB, input.investmentId, input.start, input.end);
  const days = calculateYieldDeterministic({ capitalCents: ctx.capitalCents, rateBps: ctx.rateBps, startDate: input.start, endDate: input.end, convention: ctx.convention }).daysCount;
  const id = generateSecureToken('yid');
  const db = env.DB;
  await withDb(() =>
    db.batch([
      db.prepare(
        `INSERT INTO yield_entries (id, investment_id, period_start, period_end, days_count, reference_capital_cents, rate_bps,
                                    amount_cents, status, source, calculation_version, note, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, 'manual', ?, ?)`
      ).bind(
        id, input.investmentId, input.start, input.end, days, ctx.capitalCents, ctx.rateBps, input.amountCents,
        input.amountCents < 0 ? 'ADJUSTMENT' : 'MANUAL', input.reason, input.adminId
      ),
      auditStatement(db, {
        userId: input.adminId,
        action: 'MANUAL_YIELD_RECORDED',
        entityType: 'YIELD_ENTRY',
        entityId: id,
        ipAddress: input.ip,
        newValues: { investment_id: input.investmentId, period_start: input.start, period_end: input.end, amount_cents: input.amountCents, reason: input.reason }
      })
    ])
  );
  return { id };
}

/** Reversión con contra-asiento: el original queda REVERSED y se crea una partida negativa vinculada. */
export async function reverseYieldEntry(env: Env, yieldId: string, reason: string, adminId: string, ip: string | null): Promise<{ reversalId: string }> {
  const db = env.DB;
  const original = await db
    .prepare('SELECT id, investment_id, status, source, amount_cents FROM yield_entries WHERE id = ?')
    .bind(yieldId)
    .first<{ id: string; investment_id: string; status: string; source: string; amount_cents: number }>();
  if (!original) throw new AppError(404, 'NOT_FOUND', 'Partida de rendimiento no encontrada.');
  if (original.source === 'REVERSAL') throw conflict('CANNOT_REVERSE_REVERSAL', 'Un contra-asiento no se puede reversar.');
  if (original.status !== 'CONFIRMED') throw conflict('ALREADY_REVERSED', 'Esta partida ya fue reversada.');

  const reversalId = generateSecureToken('yid');
  await withDb(() =>
    db.batch([
      db.prepare(
        `INSERT INTO yield_entries (id, investment_id, period_start, period_end, days_count, reference_capital_cents, rate_bps,
                                    amount_cents, status, source, calculation_version, reversal_of_yield_id, reversal_reason, note, created_by_user_id)
         SELECT ?, investment_id, period_start, period_end, days_count, reference_capital_cents, rate_bps,
                -amount_cents, 'REVERSED', 'REVERSAL', 'reversal', id, ?, ?, ?
         FROM yield_entries WHERE id = ? AND status = 'CONFIRMED'`
      ).bind(reversalId, reason, reason, adminId, yieldId),
      // El trigger trg_yield_reverse_guard aborta el lote si hay pagos o reinversión.
      db.prepare("UPDATE yield_entries SET status = 'REVERSED' WHERE id = ? AND status = 'CONFIRMED'").bind(yieldId),
      auditStatement(db, {
        userId: adminId,
        action: 'YIELD_REVERSED',
        entityType: 'YIELD_ENTRY',
        entityId: yieldId,
        ipAddress: ip,
        oldValues: { status: 'CONFIRMED', amount_cents: original.amount_cents },
        newValues: { status: 'REVERSED', reversal_id: reversalId, reason }
      })
    ])
  );
  return { reversalId };
}

export interface PaymentInput {
  investmentId: string;
  amountCents: number;
  paidAt: string; // ISO UTC
  reference: string;
  notes: string | null;
  allocations: Array<{ yieldEntryId: string; amountCents: number }>;
  adminId: string;
  ip: string | null;
}

/**
 * Registra un pago externo YA REALIZADO (el portal no mueve dinero) y lo asigna a partidas.
 * La referencia bancaria es única por inversión: un doble clic no duplica el pago.
 */
export async function recordExternalPayment(env: Env, input: PaymentInput): Promise<{ paymentId: string }> {
  const db = env.DB;
  const inv = await db
    .prepare('SELECT id, code, status, start_date, investor_user_id FROM investments WHERE id = ?')
    .bind(input.investmentId)
    .first<{ id: string; code: string; status: string; start_date: string; investor_user_id: string }>();
  if (!inv) throw new AppError(404, 'NOT_FOUND', 'Inversión no encontrada.');
  if (inv.status !== 'ACTIVE' && inv.status !== 'MATURED') throw conflict('INVESTMENT_NOT_ACTIVE', `No se registran pagos en una inversión en estado ${inv.status}.`);

  const paidDate = contractDateOf(input.paidAt);
  if (paidDate > todayInContractZone()) throw new AppError(400, 'PAYMENT_IN_FUTURE', 'La fecha de pago no puede ser futura: solo se registran pagos ya realizados.');
  if (paidDate < inv.start_date) throw new AppError(400, 'PAYMENT_BEFORE_CONTRACT', 'La fecha de pago es anterior al inicio del contrato.');

  const seen = new Set<string>();
  let total = 0;
  for (const a of input.allocations) {
    if (seen.has(a.yieldEntryId)) throw new AppError(400, 'DUPLICATE_ALLOCATION', 'Cada partida solo puede aparecer una vez por pago.');
    seen.add(a.yieldEntryId);
    total += a.amountCents;
  }
  if (total > input.amountCents) throw new AppError(400, 'ALLOCATION_EXCEEDS_PAYMENT', 'El total asignado no puede ser mayor que el monto del pago.');

  const investor = await db.prepare('SELECT email FROM users WHERE id = ?').bind(inv.investor_user_id).first<{ email: string }>();
  const paymentId = generateSecureToken('pay');
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO payment_records (id, investment_id, amount_cents, paid_at, status, reference, notes, recorded_by_user_id)
       VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, ?)`
    ).bind(paymentId, input.investmentId, input.amountCents, input.paidAt, input.reference, input.notes, input.adminId),
    ...input.allocations.map((a) =>
      db.prepare('INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents) VALUES (?, ?, ?, ?)')
        .bind(generateSecureToken('pal'), paymentId, a.yieldEntryId, a.amountCents)
    ),
    auditStatement(db, {
      userId: input.adminId,
      action: 'EXTERNAL_PAYMENT_RECORDED',
      entityType: 'PAYMENT_RECORD',
      entityId: paymentId,
      ipAddress: input.ip,
      newValues: {
        investment_id: input.investmentId,
        amount_cents: input.amountCents,
        paid_at: input.paidAt,
        reference: input.reference,
        allocations: input.allocations.map((a) => ({ yield_entry_id: a.yieldEntryId, amount_cents: a.amountCents }))
      }
    })
  ];
  if (investor) {
    statements.push(
      enqueueStatement(db, {
        userId: inv.investor_user_id,
        email: investor.email,
        type: 'PAYMENT_RECORDED',
        subject: 'Confirmación de pago registrado',
        body: `La administración registró un pago correspondiente a su inversión ${inv.code}. Puede consultar el detalle en su portal privado.`,
        investmentId: inv.id
      })
    );
  }
  await withDb(() => db.batch(statements));
  return { paymentId };
}

/** Reinversión contractual de una partida completa hacia el capital (solo si el contrato lo permite). */
export async function executeReinvestment(
  env: Env,
  input: { investmentId: string; yieldEntryId: string; effectiveDate: string; notes: string | null; adminId: string; ip: string | null }
): Promise<{ reinvestmentId: string; capitalMovementId: string; newCapitalCents: number }> {
  const db = env.DB;
  const inv = await db
    .prepare('SELECT id, status, maturity_date, current_capital_cents FROM investments WHERE id = ?')
    .bind(input.investmentId)
    .first<{ id: string; status: string; maturity_date: string; current_capital_cents: number }>();
  if (!inv) throw new AppError(404, 'NOT_FOUND', 'Inversión no encontrada.');
  if (inv.status !== 'ACTIVE') throw conflict('INVESTMENT_NOT_ACTIVE', 'Solo se reinvierte en inversiones vigentes.');

  const terms = await db
    .prepare('SELECT capitalization_policy FROM investment_terms WHERE investment_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to > ?) ORDER BY effective_from DESC LIMIT 1')
    .bind(input.investmentId, input.effectiveDate, input.effectiveDate)
    .first<{ capitalization_policy: string }>();
  if (terms?.capitalization_policy !== 'COMPOUND_TO_CAPITAL') {
    throw conflict('REINVEST_NOT_ALLOWED', 'El contrato de esta inversión no permite reinvertir rendimientos.');
  }

  const y = await db
    .prepare("SELECT id, amount_cents, period_end FROM yield_entries WHERE id = ? AND investment_id = ? AND status = 'CONFIRMED'")
    .bind(input.yieldEntryId, input.investmentId)
    .first<{ id: string; amount_cents: number; period_end: string }>();
  if (!y || y.amount_cents <= 0) throw new AppError(404, 'NOT_FOUND', 'Partida de rendimiento confirmada no encontrada.');
  if (input.effectiveDate < y.period_end || input.effectiveDate >= inv.maturity_date) {
    throw new AppError(400, 'INVALID_EFFECTIVE_DATE', `La fecha efectiva debe ser desde ${y.period_end} y antes del vencimiento (${inv.maturity_date}).`);
  }
  await assertNotInsideClosedPeriod(db, input.investmentId, input.effectiveDate);

  const movementId = generateSecureToken('mov');
  const reinvestmentId = generateSecureToken('rei');
  await withDb(() =>
    db.batch([
      db.prepare(
        `INSERT INTO capital_movements (id, investment_id, movement_type, amount_cents, effective_date, notes, recorded_by_user_id)
         VALUES (?, ?, 'REINVESTMENT_CREDIT', ?, ?, ?, ?)`
      ).bind(movementId, input.investmentId, y.amount_cents, input.effectiveDate, input.notes ?? `Reinversión de la partida ${y.id}`, input.adminId),
      // Trigger trg_reinvestment_validate: partida completa, confirmada y sin pagos.
      db.prepare(
        `INSERT INTO reinvestments (id, investment_id, yield_entry_id, capital_movement_id, amount_cents, effective_date, recorded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(reinvestmentId, input.investmentId, y.id, movementId, y.amount_cents, input.effectiveDate, input.adminId),
      db.prepare("UPDATE investments SET current_capital_cents = current_capital_cents + ?, updated_at = datetime('now') WHERE id = ?")
        .bind(y.amount_cents, input.investmentId),
      auditStatement(db, {
        userId: input.adminId,
        action: 'YIELD_REINVESTED',
        entityType: 'REINVESTMENT',
        entityId: reinvestmentId,
        ipAddress: input.ip,
        oldValues: { current_capital_cents: inv.current_capital_cents },
        newValues: { investment_id: input.investmentId, yield_entry_id: y.id, amount_cents: y.amount_cents, effective_date: input.effectiveDate }
      })
    ])
  );
  const after = await db.prepare('SELECT current_capital_cents FROM investments WHERE id = ?').bind(input.investmentId).first<{ current_capital_cents: number }>();
  return { reinvestmentId, capitalMovementId: movementId, newCapitalCents: after?.current_capital_cents ?? 0 };
}
