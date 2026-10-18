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

export type ReferenceRateCode = 'CETES_28' | 'CETES_91' | 'CETES_182' | 'CETES_364';

/** Detalle de la tasa aplicada. Para CETES: tasa de referencia vigente al inicio del periodo + diferencial. */
export interface RateDetail {
  rateType: 'FIXED' | 'REFERENCE';
  referenceRateCode: ReferenceRateCode | null;
  referenceRateId: string | null;
  referenceRateBps: number | null;
  referenceRateDate: string | null;
  spreadBps: number | null;
}

export interface CalculationContext {
  investment: { id: string; code: string; status: string; start_date: string; maturity_date: string; investor_user_id: string; currency: string };
  capitalCents: number;
  /** Tasa anual APLICADA al periodo (fija, o referencia + diferencial). */
  rateBps: number;
  rate: RateDetail;
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
    .prepare('SELECT id, code, status, start_date, maturity_date, investor_user_id, currency FROM investments WHERE id = ?')
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
      `SELECT rate_type, fixed_annual_rate_bps, reference_rate_code, spread_bps, day_count_convention, payout_frequency, capitalization_policy
       FROM investment_terms
       WHERE investment_id = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to > ?)
       ORDER BY effective_from DESC, version DESC LIMIT 1`
    )
    .bind(investmentId, start, start)
    .first<{ rate_type: 'FIXED' | 'REFERENCE'; fixed_annual_rate_bps: number | null; reference_rate_code: ReferenceRateCode | null; spread_bps: number | null; day_count_convention: DayCountConvention; payout_frequency: PayoutFrequency; capitalization_policy: CapitalizationPolicy }>();
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

  const rate = await resolveRate(db, terms, start);

  return {
    investment: inv,
    capitalCents,
    rateBps: rate.appliedBps,
    rate: rate.detail,
    convention: terms.day_count_convention,
    payoutFrequency: terms.payout_frequency,
    capitalizationPolicy: terms.capitalization_policy
  };
}

/**
 * Tasa aplicada al periodo [start, end).
 * - FIXED: la tasa anual fija del contrato.
 * - REFERENCE (CETES): la última tasa capturada con fecha efectiva <= inicio del periodo, más el diferencial.
 *   PENDIENTE de confirmar con el cliente: plazo de CETES, fecha de observación y si "−1 punto" son 100 pb.
 */
export async function resolveRate(
  db: D1Database,
  terms: { rate_type: 'FIXED' | 'REFERENCE'; fixed_annual_rate_bps: number | null; reference_rate_code: ReferenceRateCode | null; spread_bps: number | null },
  start: string
): Promise<{ appliedBps: number; detail: RateDetail }> {
  if (terms.rate_type === 'FIXED') {
    if (!terms.fixed_annual_rate_bps) throw new AppError(409, 'TERMS_NOT_FOUND', 'La inversión no tiene tasa fija registrada.');
    return {
      appliedBps: terms.fixed_annual_rate_bps,
      detail: { rateType: 'FIXED', referenceRateCode: null, referenceRateId: null, referenceRateBps: null, referenceRateDate: null, spreadBps: null }
    };
  }
  const code = terms.reference_rate_code!;
  const ref = await db
    .prepare('SELECT id, annual_rate_bps, effective_date FROM reference_rates WHERE rate_code = ? AND effective_date <= ? ORDER BY effective_date DESC LIMIT 1')
    .bind(code, start)
    .first<{ id: string; annual_rate_bps: number; effective_date: string }>();
  if (!ref) {
    throw new AppError(409, 'REFERENCE_RATE_MISSING', `Registre la tasa ${code.replace('_', ' ')} vigente al ${start} en Administración › Tasas de referencia.`, { rate_code: code, date: start });
  }
  const applied = ref.annual_rate_bps + (terms.spread_bps ?? 0);
  if (applied <= 0) throw new AppError(409, 'RATE_NOT_POSITIVE', 'La tasa aplicada (referencia + diferencial) no es positiva.');
  return {
    appliedBps: applied,
    detail: { rateType: 'REFERENCE', referenceRateCode: code, referenceRateId: ref.id, referenceRateBps: ref.annual_rate_bps, referenceRateDate: ref.effective_date, spreadBps: terms.spread_bps }
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
