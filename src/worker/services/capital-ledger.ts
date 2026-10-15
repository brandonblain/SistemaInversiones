// Servicio de Control de Capital (Capital Ledger)
import { generateSecureToken } from './crypto';
import { recordAuditLog } from './audit';

export type MovementType = 'INITIAL_DEPOSIT' | 'CAPITAL_CONTRIBUTION' | 'CAPITAL_WITHDRAWAL' | 'REINVESTMENT_CREDIT';

export interface RecordMovementInput {
  investmentId: string;
  movementType: MovementType;
  amountCents: number;
  effectiveDate: string; // YYYY-MM-DD
  notes?: string | null;
  recordedByUserId: string;
}

export async function recordCapitalMovement(
  db: D1Database,
  input: RecordMovementInput
): Promise<{ movementId: string; newCurrentCapitalCents: number }> {
  if (input.amountCents <= 0) {
    throw new Error('El importe del movimiento de capital debe ser mayor a cero centavos.');
  }

  // 1. Obtener inversión
  const investment = await db.prepare(
    'SELECT id, current_capital_cents, status FROM investments WHERE id = ?'
  ).bind(input.investmentId).first<{ id: string; current_capital_cents: number; status: string }>();

  if (!investment) {
    throw new Error(`Inversión no encontrada: ${input.investmentId}`);
  }

  if (investment.status !== 'ACTIVE' && investment.status !== 'DRAFT') {
    throw new Error(`No se pueden registrar movimientos en una inversión con estado: ${investment.status}`);
  }

  let newCapital = investment.current_capital_cents;
  if (input.movementType === 'CAPITAL_WITHDRAWAL') {
    if (newCapital < input.amountCents) {
      throw new Error(`Capital insuficiente para retiro. Capital disponible: ${newCapital} centavos.`);
    }
    newCapital -= input.amountCents;
  } else {
    // INITIAL_DEPOSIT, CAPITAL_CONTRIBUTION, REINVESTMENT_CREDIT
    newCapital += input.amountCents;
  }

  const movementId = generateSecureToken('mov');

  // Ejecutar actualización
  await db.prepare(
    `INSERT INTO capital_movements (id, investment_id, movement_type, amount_cents, effective_date, notes, recorded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    movementId,
    input.investmentId,
    input.movementType,
    input.amountCents,
    input.effectiveDate,
    input.notes || null,
    input.recordedByUserId
  ).run();

  await db.prepare(
    "UPDATE investments SET current_capital_cents = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(newCapital, input.investmentId).run();

  await recordAuditLog(db, {
    userId: input.recordedByUserId,
    action: `CAPITAL_MOVEMENT_${input.movementType}`,
    entityType: 'INVESTMENT',
    entityId: input.investmentId,
    oldValues: { current_capital_cents: investment.current_capital_cents },
    newValues: { current_capital_cents: newCapital, movement_id: movementId, amount_cents: input.amountCents }
  });

  return { movementId, newCurrentCapitalCents: newCapital };
}

export async function getCapitalLedgerSummary(db: D1Database, investmentId: string): Promise<{
  currentCapitalCents: number;
  totalContributedCents: number;
  totalWithdrawnCents: number;
  totalReinvestedCents: number;
}> {
  const movements = await db.prepare(
    `SELECT movement_type, SUM(amount_cents) as total_cents
     FROM capital_movements
     WHERE investment_id = ?
     GROUP BY movement_type`
  ).bind(investmentId).all<{ movement_type: MovementType; total_cents: number }>();

  let initial = 0;
  let contributions = 0;
  let withdrawals = 0;
  let reinvestments = 0;

  for (const m of movements.results) {
    if (m.movement_type === 'INITIAL_DEPOSIT') initial = m.total_cents;
    else if (m.movement_type === 'CAPITAL_CONTRIBUTION') contributions = m.total_cents;
    else if (m.movement_type === 'CAPITAL_WITHDRAWAL') withdrawals = m.total_cents;
    else if (m.movement_type === 'REINVESTMENT_CREDIT') reinvestments = m.total_cents;
  }

  const currentCapitalCents = initial + contributions + reinvestments - withdrawals;

  return {
    currentCapitalCents,
    totalContributedCents: initial + contributions,
    totalWithdrawnCents: withdrawals,
    totalReinvestedCents: reinvestments
  };
}
