// Servicio Contable de Rendimientos, Pagos Externos y Reinversiones
import { generateSecureToken } from './crypto';
import { recordAuditLog } from './audit';
import { recordCapitalMovement } from './capital-ledger';

export interface ConfirmYieldInput {
  investmentId: string;
  periodStart: string;
  periodEnd: string;
  daysCount: number;
  referenceCapitalCents: number;
  rateBps: number;
  amountCents: number;
  source?: 'AUTO' | 'MANUAL' | 'ADJUSTMENT';
  calculationVersion?: string;
  recordedByUserId: string;
  notes?: string | null;
}

export interface ManualYieldInput {
  investmentId: string;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  reason: string;
  recordedByUserId: string;
}

export interface RecordPaymentInput {
  investmentId: string;
  amountCents: number;
  paidAt: string;
  reference: string;
  notes?: string | null;
  recordedByUserId: string;
  allocations: Array<{
    yieldEntryId: string;
    amountCents: number;
  }>;
}

export interface ReinvestmentInput {
  investmentId: string;
  yieldEntryId: string;
  effectiveDate: string;
  notes?: string | null;
  recordedByUserId: string;
}

/**
 * Registra o confirma de forma idempotente una partida de rendimiento.
 * Si ya existe una partida confirmada para el mismo periodo exacto, retorna la existente sin duplicar.
 */
export async function confirmYieldEntry(db: D1Database, input: ConfirmYieldInput): Promise<{
  id: string;
  isExisting: boolean;
  amountCents: number;
}> {
  // 1. Verificar idempotencia: buscar si ya existe partida CONFIRMED para este periodo exacto
  const existing = await db.prepare(
    `SELECT id, amount_cents FROM yield_entries 
     WHERE investment_id = ? AND period_start = ? AND period_end = ? AND status = 'CONFIRMED'`
  ).bind(input.investmentId, input.periodStart, input.periodEnd).first<{ id: string; amount_cents: number }>();

  if (existing) {
    return { id: existing.id, isExisting: true, amountCents: existing.amount_cents };
  }

  const id = generateSecureToken('yid');
  const source = input.source || 'AUTO';
  const calculationVersion = input.calculationVersion || 'v1.0';

  await db.prepare(
    `INSERT INTO yield_entries (
      id, investment_id, period_start, period_end, days_count, 
      reference_capital_cents, rate_bps, amount_cents, status, source, 
      calculation_version, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?)`
  ).bind(
    id,
    input.investmentId,
    input.periodStart,
    input.periodEnd,
    input.daysCount,
    input.referenceCapitalCents,
    input.rateBps,
    input.amountCents,
    source,
    calculationVersion,
    input.recordedByUserId
  ).run();

  await recordAuditLog(db, {
    userId: input.recordedByUserId,
    action: 'YIELD_CONFIRMED',
    entityType: 'YIELD_ENTRY',
    entityId: id,
    newValues: {
      investment_id: input.investmentId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      amount_cents: input.amountCents,
      source
    }
  });

  return { id, isExisting: false, amountCents: input.amountCents };
}

/**
 * Registra un rendimiento manual o ajuste extraordinario con justificación obligatoria.
 */
export async function recordManualYield(db: D1Database, input: ManualYieldInput): Promise<{ id: string }> {
  if (!input.reason || input.reason.trim().length < 5) {
    throw new Error('Debe proporcionar un motivo justificado para el rendimiento manual (mínimo 5 caracteres).');
  }

  // Obtener capital y tasa vigente de la inversión
  const investment = await db.prepare(
    'SELECT current_capital_cents FROM investments WHERE id = ?'
  ).bind(input.investmentId).first<{ current_capital_cents: number }>();

  if (!investment) {
    throw new Error(`Inversión no encontrada: ${input.investmentId}`);
  }

  const terms = await db.prepare(
    'SELECT fixed_annual_rate_bps FROM investment_terms WHERE investment_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(input.investmentId).first<{ fixed_annual_rate_bps: number }>();

  const rateBps = terms?.fixed_annual_rate_bps || 1200;
  const id = generateSecureToken('yid');

  await db.prepare(
    `INSERT INTO yield_entries (
      id, investment_id, period_start, period_end, days_count,
      reference_capital_cents, rate_bps, amount_cents, status, source,
      calculation_version, reversal_reason, created_by_user_id
    ) VALUES (?, ?, ?, ?, 30, ?, ?, ?, 'CONFIRMED', 'MANUAL', 'manual-adjustment', ?, ?)`
  ).bind(
    id,
    input.investmentId,
    input.periodStart,
    input.periodEnd,
    investment.current_capital_cents,
    rateBps,
    input.amountCents,
    input.reason,
    input.recordedByUserId
  ).run();

  await recordAuditLog(db, {
    userId: input.recordedByUserId,
    action: 'MANUAL_YIELD_RECORDED',
    entityType: 'YIELD_ENTRY',
    entityId: id,
    newValues: {
      investment_id: input.investmentId,
      amount_cents: input.amountCents,
      reason: input.reason
    }
  });

  return { id };
}

/**
 * Reversa una partida de rendimiento existente creando un contra-asiento de ajuste negativo.
 * No destruye el registro original, garantizando la inmutabilidad contable.
 */
export async function reverseYieldEntry(
  db: D1Database,
  yieldId: string,
  reason: string,
  adminUserId: string
): Promise<{ reversalId: string }> {
  if (!reason || reason.trim().length < 5) {
    throw new Error('Debe proporcionar un motivo justificado para la reversión.');
  }

  const original = await db.prepare(
    'SELECT * FROM yield_entries WHERE id = ?'
  ).bind(yieldId).first<Record<string, unknown>>();

  if (!original) {
    throw new Error(`Partida de rendimiento no encontrada: ${yieldId}`);
  }

  if (original.status === 'REVERSED') {
    throw new Error('Esta partida ya ha sido reversada previamente.');
  }

  // Verificar si ya tiene pagos o reinversiones asignadas
  const allocations = await db.prepare(
    'SELECT SUM(amount_cents) as allocated_cents FROM payment_allocations WHERE yield_entry_id = ?'
  ).bind(yieldId).first<{ allocated_cents: number | null }>();

  if (allocations?.allocated_cents && allocations.allocated_cents > 0) {
    throw new Error(`No se puede reversar un rendimiento que ya tiene pagos asignados (${allocations.allocated_cents} centavos).`);
  }

  const reinvestment = await db.prepare(
    "SELECT id FROM reinvestments WHERE yield_entry_id = ? AND status = 'CONFIRMED'"
  ).bind(yieldId).first();

  if (reinvestment) {
    throw new Error('No se puede reversar un rendimiento que ya fue reinvertido al capital.');
  }

  const reversalId = generateSecureToken('yid');
  const negativeAmount = -Number(original.amount_cents);

  // 1. Marcar original como REVERSED
  await db.prepare("UPDATE yield_entries SET status = 'REVERSED' WHERE id = ?").bind(yieldId).run();

  // 2. Crear contra-asiento
  await db.prepare(
    `INSERT INTO yield_entries (
      id, investment_id, period_start, period_end, days_count,
      reference_capital_cents, rate_bps, amount_cents, status, source,
      calculation_version, reversal_of_yield_id, reversal_reason, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REVERSED', 'REVERSAL', 'reversal-contra-entry', ?, ?, ?)`
  ).bind(
    reversalId,
    original.investment_id,
    original.period_start,
    original.period_end,
    original.days_count,
    original.reference_capital_cents,
    original.rate_bps,
    negativeAmount,
    yieldId,
    reason,
    adminUserId
  ).run();

  await recordAuditLog(db, {
    userId: adminUserId,
    action: 'YIELD_REVERSED',
    entityType: 'YIELD_ENTRY',
    entityId: yieldId,
    newValues: { reversal_id: reversalId, reason, negative_amount: negativeAmount }
  });

  return { reversalId };
}

/**
 * Registra un pago bancario externo y lo asigna a partidas de rendimiento con soporte para pagos parciales.
 */
export async function recordExternalPayment(db: D1Database, input: RecordPaymentInput): Promise<{ paymentId: string }> {
  if (input.amountCents <= 0) {
    throw new Error('El importe del pago debe ser mayor a cero.');
  }
  if (!input.reference || input.reference.trim() === '') {
    throw new Error('La referencia bancaria / SPEI es obligatoria para registrar pagos externos.');
  }

  // Validar suma de asignaciones
  let totalAllocatedCents = 0;
  for (const alloc of input.allocations) {
    if (alloc.amountCents <= 0) {
      throw new Error('Cada asignación de pago debe tener un importe mayor a cero centavos.');
    }
    totalAllocatedCents += alloc.amountCents;
  }

  if (totalAllocatedCents > input.amountCents) {
    throw new Error(
      `El total asignado (${totalAllocatedCents} centavos) no puede ser mayor que el monto total del pago (${input.amountCents} centavos).`
    );
  }

  // Validar que cada rendimiento tenga saldo suficiente pendiente por pagar
  for (const alloc of input.allocations) {
    const yieldEntry = await db.prepare(
      "SELECT id, amount_cents, status FROM yield_entries WHERE id = ? AND investment_id = ? AND status = 'CONFIRMED'"
    ).bind(alloc.yieldEntryId, input.investmentId).first<{ id: string; amount_cents: number; status: string }>();

    if (!yieldEntry) {
      throw new Error(`Partida de rendimiento no encontrada o no confirmada: ${alloc.yieldEntryId}`);
    }

    const prevAllocated = await db.prepare(
      'SELECT COALESCE(SUM(amount_cents), 0) as paid_cents FROM payment_allocations WHERE yield_entry_id = ?'
    ).bind(alloc.yieldEntryId).first<{ paid_cents: number }>();

    const prevPaid = prevAllocated?.paid_cents || 0;
    const remainingToPay = yieldEntry.amount_cents - prevPaid;

    if (alloc.amountCents > remainingToPay) {
      throw new Error(
        `La asignación (${alloc.amountCents} centavos) excede el saldo pendiente (${remainingToPay} centavos) de la partida ${alloc.yieldEntryId}.`
      );
    }
  }

  const paymentId = generateSecureToken('pay');

  // Insertar pago
  await db.prepare(
    `INSERT INTO payment_records (id, investment_id, amount_cents, paid_at, status, reference, notes, recorded_by_user_id)
     VALUES (?, ?, ?, ?, 'CONFIRMED', ?, ?, ?)`
  ).bind(
    paymentId,
    input.investmentId,
    input.amountCents,
    input.paidAt,
    input.reference,
    input.notes || null,
    input.recordedByUserId
  ).run();

  // Insertar asignaciones
  for (const alloc of input.allocations) {
    const allocId = generateSecureToken('pal');
    await db.prepare(
      `INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents)
       VALUES (?, ?, ?, ?)`
    ).bind(allocId, paymentId, alloc.yieldEntryId, alloc.amountCents).run();
  }

  // Obtener inversionista para notificar
  const investment = await db.prepare(
    'SELECT investor_user_id, code FROM investments WHERE id = ?'
  ).bind(input.investmentId).first<{ investor_user_id: string; code: string }>();

  if (investment) {
    const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(investment.investor_user_id).first<{ email: string }>();
    if (user) {
      await db.prepare(
        `INSERT INTO notification_events (id, user_id, event_type, recipient_email, subject, body_preview)
         VALUES (?, ?, 'PAYMENT_RECORDED', ?, 'Confirmación de pago registrado', ?)`
      ).bind(
        generateSecureToken('not'),
        investment.investor_user_id,
        user.email,
        `Se ha registrado un pago externo en su inversión ${investment.code} con referencia ${input.reference}. Puede consultar los detalles en el portal privado.`
      ).run();
    }
  }

  await recordAuditLog(db, {
    userId: input.recordedByUserId,
    action: 'EXTERNAL_PAYMENT_RECORDED',
    entityType: 'PAYMENT_RECORD',
    entityId: paymentId,
    newValues: {
      investment_id: input.investmentId,
      amount_cents: input.amountCents,
      reference: input.reference,
      allocations_count: input.allocations.length
    }
  });

  return { paymentId };
}

/**
 * Ejecuta la reinversión de un rendimiento confirmado hacia el capital de la inversión.
 * Valida que la política contractual permita capitalización ('COMPOUND_TO_CAPITAL').
 */
export async function executeReinvestment(db: D1Database, input: ReinvestmentInput): Promise<{
  reinvestmentId: string;
  capitalMovementId: string;
  newCapitalCents: number;
}> {
  // 1. Validar política de capitalización en los términos contractuales vigentes
  const terms = await db.prepare(
    'SELECT capitalization_policy FROM investment_terms WHERE investment_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(input.investmentId).first<{ capitalization_policy: string }>();

  if (!terms || terms.capitalization_policy !== 'COMPOUND_TO_CAPITAL') {
    throw new Error('El contrato de esta inversión no permite la reinversión de rendimientos (capitalización no autorizada).');
  }

  // 2. Validar que la partida de rendimiento exista, esté confirmada y no haya sido pagada ni reinvertida
  const yieldEntry = await db.prepare(
    "SELECT id, amount_cents, status FROM yield_entries WHERE id = ? AND investment_id = ? AND status = 'CONFIRMED'"
  ).bind(input.yieldEntryId, input.investmentId).first<{ id: string; amount_cents: number; status: string }>();

  if (!yieldEntry) {
    throw new Error(`Partida de rendimiento confirmada no encontrada: ${input.yieldEntryId}`);
  }

  const existingReinvest = await db.prepare(
    'SELECT id FROM reinvestments WHERE yield_entry_id = ?'
  ).bind(input.yieldEntryId).first();

  if (existingReinvest) {
    throw new Error('Esta partida de rendimiento ya ha sido reinvertida previamente.');
  }

  const allocated = await db.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) as paid_cents FROM payment_allocations WHERE yield_entry_id = ?'
  ).bind(input.yieldEntryId).first<{ paid_cents: number }>();

  if (allocated && allocated.paid_cents > 0) {
    throw new Error('No se puede reinvertir un rendimiento que ya tiene pagos en efectivo asignados.');
  }

  // 3. Registrar movimiento de capital de tipo REINVESTMENT_CREDIT
  const movementRes = await recordCapitalMovement(db, {
    investmentId: input.investmentId,
    movementType: 'REINVESTMENT_CREDIT',
    amountCents: yieldEntry.amount_cents,
    effectiveDate: input.effectiveDate,
    notes: input.notes || `Reinversión de rendimiento periodo ${yieldEntry.id}`,
    recordedByUserId: input.recordedByUserId
  });

  // 4. Registrar reinversión
  const reinvestmentId = generateSecureToken('rei');
  await db.prepare(
    `INSERT INTO reinvestments (id, investment_id, yield_entry_id, capital_movement_id, amount_cents, effective_date, recorded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    reinvestmentId,
    input.investmentId,
    input.yieldEntryId,
    movementRes.movementId,
    yieldEntry.amount_cents,
    input.effectiveDate,
    input.recordedByUserId
  ).run();

  await recordAuditLog(db, {
    userId: input.recordedByUserId,
    action: 'YIELD_REINVESTED',
    entityType: 'REINVESTMENT',
    entityId: reinvestmentId,
    newValues: {
      investment_id: input.investmentId,
      yield_entry_id: input.yieldEntryId,
      amount_cents: yieldEntry.amount_cents,
      new_capital_cents: movementRes.newCurrentCapitalCents
    }
  });

  return {
    reinvestmentId,
    capitalMovementId: movementRes.movementId,
    newCapitalCents: movementRes.newCurrentCapitalCents
  };
}

/**
 * Calcula el balance contable consolidado de una inversión o de un inversionista sin doble conteo.
 */
export async function getInvestmentFinancialSummary(db: D1Database, investmentId: string): Promise<{
  capitalVigenteCents: number;
  rendimientoDevengadoCents: number;
  rendimientoConfirmadoCents: number;
  rendimientoPagadoCents: number;
  rendimientoReinvertidoCents: number;
  rendimientoPendienteCents: number;
}> {
  const inv = await db.prepare(
    'SELECT current_capital_cents FROM investments WHERE id = ?'
  ).bind(investmentId).first<{ current_capital_cents: number }>();

  const capitalVigenteCents = inv?.current_capital_cents || 0;

  // Rendimientos confirmados totales (suma algebraica incluyendo contra-asientos de reversión)
  const yieldTotal = await db.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as total_confirmed FROM yield_entries WHERE investment_id = ? AND status = 'CONFIRMED'"
  ).bind(investmentId).first<{ total_confirmed: number }>();

  const rendimientoConfirmadoCents = yieldTotal?.total_confirmed || 0;
  const rendimientoDevengadoCents = rendimientoConfirmadoCents; // En este modelo, devengado confirmado

  // Rendimientos pagados mediante allocations
  const paidTotal = await db.prepare(
    `SELECT COALESCE(SUM(pa.amount_cents), 0) as total_paid
     FROM payment_allocations pa
     JOIN payment_records pr ON pa.payment_record_id = pr.id
     WHERE pr.investment_id = ? AND pr.status = 'CONFIRMED'`
  ).bind(investmentId).first<{ total_paid: number }>();

  const rendimientoPagadoCents = paidTotal?.total_paid || 0;

  // Rendimientos reinvertidos
  const reinvestTotal = await db.prepare(
    "SELECT COALESCE(SUM(amount_cents), 0) as total_reinvested FROM reinvestments WHERE investment_id = ? AND status = 'CONFIRMED'"
  ).bind(investmentId).first<{ total_reinvested: number }>();

  const rendimientoReinvertidoCents = reinvestTotal?.total_reinvested || 0;

  // Saldo pendiente = Confirmado - Pagado - Reinvertido
  const rendimientoPendienteCents = Math.max(
    0,
    rendimientoConfirmadoCents - rendimientoPagadoCents - rendimientoReinvertidoCents
  );

  return {
    capitalVigenteCents,
    rendimientoDevengadoCents,
    rendimientoConfirmadoCents,
    rendimientoPagadoCents,
    rendimientoReinvertidoCents,
    rendimientoPendienteCents
  };
}
