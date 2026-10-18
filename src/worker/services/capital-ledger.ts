// Libro de capital: el capital de una fecha se reconstruye siempre desde los movimientos (inmutables).
// investments.current_capital_cents es una copia de lectura rápida que se actualiza en el mismo lote.
import { AppError } from '../lib/errors';
import type { DayCountConvention, CapitalizationPolicy, PayoutFrequency } from './yield-calculator';

export type MovementType = 'INITIAL_DEPOSIT' | 'CAPITAL_CONTRIBUTION' | 'CAPITAL_WITHDRAWAL' | 'REINVESTMENT_CREDIT';

const SIGNED_AMOUNT = "CASE WHEN movement_type = 'CAPITAL_WITHDRAWAL' THEN -amount_cents ELSE amount_cents END";

/** Capital vigente al inicio de `date` (incluye movimientos con fecha efectiva <= date). */
export async function getCapitalAsOf(db: D1Database, investmentId: string, date: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COALESCE(SUM(${SIGNED_AMOUNT}), 0) AS capital FROM capital_movements WHERE investment_id = ? AND effective_date <= ?`)
    .bind(investmentId, date)
    .first<{ capital: number }>();
  return row?.capital ?? 0;
}

export interface CalculationContext {
  investment: { id: string; code: string; status: string; start_date: string; maturity_date: string; investor_user_id: string };
  capitalCents: number;
  rateBps: number;
  convention: DayCountConvention;
  payoutFrequency: PayoutFrequency;
  capitalizationPolicy: CapitalizationPolicy;
}

/**
 * Reúne capital y términos vigentes para el periodo [start, end) y valida que el periodo sea calculable:
 * - dentro de la vigencia del contrato y con la inversión vigente o vencida;
 * - sin cambios de capital ni de términos DENTRO del periodo (si los hay, el periodo debe dividirse).
 * Nunca usa valores por omisión: si faltan términos, falla.
 */
export async function resolveCalculationContext(db: D1Database, investmentId: string, start: string, end: string): Promise<CalculationContext> {
  const inv = await db
    .prepare('SELECT id, code, status, start_date, maturity_date, investor_user_id FROM investments WHERE id = ?')
    .bind(investmentId)
    .first<CalculationContext['investment']>();
  if (!inv) throw new AppError(404, 'NOT_FOUND', 'Inversión no encontrada.');
  if (inv.status !== 'ACTIVE' && inv.status !== 'MATURED') {
    throw new AppError(409, 'INVESTMENT_NOT_ACTIVE', `No se calculan rendimientos de una inversión en estado ${inv.status}.`);
  }
  if (end <= start) throw new AppError(400, 'INVALID_PERIOD', 'La fecha final debe ser posterior a la inicial. El periodo incluye el inicio y excluye el fin.');
  if (start < inv.start_date || end > inv.maturity_date) {
    throw new AppError(400, 'PERIOD_OUTSIDE_CONTRACT', `El periodo debe estar entre ${inv.start_date} y ${inv.maturity_date}.`);
  }

  const terms = await db
    .prepare(
      `SELECT fixed_annual_rate_bps, day_count_convention, payout_frequency, capitalization_policy
       FROM investment_terms
       WHERE investment_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
       ORDER BY effective_from DESC, version DESC LIMIT 1`
    )
    .bind(investmentId, start, start)
    .first<{ fixed_annual_rate_bps: number; day_count_convention: DayCountConvention; payout_frequency: PayoutFrequency; capitalization_policy: CapitalizationPolicy }>();
  if (!terms) throw new AppError(409, 'TERMS_NOT_FOUND', 'No hay términos contractuales vigentes para el inicio del periodo.');

  const termChange = await db
    .prepare('SELECT effective_from FROM investment_terms WHERE investment_id = ? AND effective_from > ? AND effective_from < ? LIMIT 1')
    .bind(investmentId, start, end)
    .first<{ effective_from: string }>();
  if (termChange) {
    throw new AppError(409, 'PERIOD_CROSSES_TERMS_CHANGE', `Los términos cambian el ${termChange.effective_from}; divida el periodo en esa fecha.`, {
      split_at: termChange.effective_from
    });
  }

  const capitalChange = await db
    .prepare('SELECT effective_date FROM capital_movements WHERE investment_id = ? AND effective_date > ? AND effective_date < ? ORDER BY effective_date LIMIT 1')
    .bind(investmentId, start, end)
    .first<{ effective_date: string }>();
  if (capitalChange) {
    throw new AppError(409, 'PERIOD_CROSSES_CAPITAL_CHANGE', `El capital cambia el ${capitalChange.effective_date}; divida el periodo en esa fecha.`, {
      split_at: capitalChange.effective_date
    });
  }

  const capitalCents = await getCapitalAsOf(db, investmentId, start);
  if (capitalCents <= 0) throw new AppError(409, 'NO_CAPITAL', 'La inversión no tiene capital vigente al inicio del periodo.');

  return {
    investment: inv,
    capitalCents,
    rateBps: terms.fixed_annual_rate_bps,
    convention: terms.day_count_convention,
    payoutFrequency: terms.payout_frequency,
    capitalizationPolicy: terms.capitalization_policy
  };
}

/** Un cambio de capital no puede caer dentro de un periodo ya confirmado (no se recalculan periodos cerrados). */
export async function assertNotInsideClosedPeriod(db: D1Database, investmentId: string, effectiveDate: string) {
  const closed = await db
    .prepare(
      `SELECT period_start, period_end FROM yield_entries
       WHERE investment_id = ? AND status = 'CONFIRMED' AND source = 'AUTO' AND period_start < ? AND period_end > ? LIMIT 1`
    )
    .bind(investmentId, effectiveDate, effectiveDate)
    .first<{ period_start: string; period_end: string }>();
  if (closed) {
    throw new AppError(409, 'CAPITAL_CHANGE_IN_CLOSED_PERIOD', `La fecha efectiva cae dentro del periodo confirmado ${closed.period_start} – ${closed.period_end}.`);
  }
}
