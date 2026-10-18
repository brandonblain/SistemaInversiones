// Modelos de lectura para la UI. Las cifras se calculan aquí (servidor), nunca en el navegador.
// Definiciones (sin doble conteo):
// - confirmado  = Σ partidas CONFIRMED (incluye ajustes manuales; excluye reversadas y contra-asientos)
// - generado    = confirmado (en este modelo no se persisten devengos en borrador)
// - pagado      = Σ asignaciones de pagos CONFIRMED
// - reinvertido = Σ reinversiones CONFIRMED
// - pendiente   = max(0, confirmado − pagado − reinvertido)
import { contractDateOf, todayInContractZone } from '../lib/dates';

export interface Balance {
  capital_cents: number;
  yield_generated_cents: number;
  yield_confirmed_cents: number;
  yield_paid_cents: number;
  yield_reinvested_cents: number;
  yield_pending_cents: number;
}

const PAID_BY_YIELD = `COALESCE((SELECT SUM(a.amount_cents) FROM payment_allocations a
  JOIN payment_records p ON p.id = a.payment_record_id
  WHERE a.yield_entry_id = y.id AND p.status = 'CONFIRMED'), 0)`;
const REINVESTED_BY_YIELD = `COALESCE((SELECT SUM(r.amount_cents) FROM reinvestments r
  WHERE r.yield_entry_id = y.id AND r.status = 'CONFIRMED'), 0)`;

const placeholders = (n: number) => Array.from({ length: n }, () => '?').join(', ');

export async function balancesFor(db: D1Database, investmentIds: string[]): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>();
  if (investmentIds.length === 0) return out;
  const rows = await db
    .prepare(
      `SELECT i.id, i.current_capital_cents AS capital,
         COALESCE((SELECT SUM(amount_cents) FROM yield_entries WHERE investment_id = i.id AND status = 'CONFIRMED'), 0) AS confirmed,
         COALESCE((SELECT SUM(a.amount_cents) FROM payment_allocations a JOIN payment_records p ON p.id = a.payment_record_id
                   WHERE p.investment_id = i.id AND p.status = 'CONFIRMED'), 0) AS paid,
         COALESCE((SELECT SUM(amount_cents) FROM reinvestments WHERE investment_id = i.id AND status = 'CONFIRMED'), 0) AS reinvested
       FROM investments i WHERE i.id IN (${placeholders(investmentIds.length)})`
    )
    .bind(...investmentIds)
    .all<{ id: string; capital: number; confirmed: number; paid: number; reinvested: number }>();
  for (const r of rows.results) {
    out.set(r.id, {
      capital_cents: r.capital,
      yield_generated_cents: r.confirmed,
      yield_confirmed_cents: r.confirmed,
      yield_paid_cents: r.paid,
      yield_reinvested_cents: r.reinvested,
      yield_pending_cents: Math.max(0, r.confirmed - r.paid - r.reinvested)
    });
  }
  return out;
}

const emptyBalance = (): Balance => ({
  capital_cents: 0,
  yield_generated_cents: 0,
  yield_confirmed_cents: 0,
  yield_paid_cents: 0,
  yield_reinvested_cents: 0,
  yield_pending_cents: 0
});

export const INVESTMENT_COLUMNS = `i.id, i.investor_user_id, i.code, i.investment_type, i.status, i.currency, i.start_date, i.maturity_date,
  i.initial_capital_cents, i.current_capital_cents, i.notes, i.created_at,
  t.fixed_annual_rate_bps, t.payout_frequency, t.day_count_convention, t.capitalization_policy`;
export const TERMS_JOIN = 'LEFT JOIN investment_terms t ON t.investment_id = i.id AND t.effective_to IS NULL';

export type InvestmentRow = Record<string, unknown> & { id: string };

/** Elemento de lista (forma del contrato: terms + stats). */
export function toListItem(row: InvestmentRow, b: Balance = emptyBalance()) {
  return {
    id: row.id,
    code: row.code,
    investment_type: row.investment_type,
    status: row.status,
    currency: row.currency,
    start_date: row.start_date,
    maturity_date: row.maturity_date,
    current_capital_cents: row.current_capital_cents,
    terms: {
      fixed_annual_rate_bps: row.fixed_annual_rate_bps,
      payout_frequency: row.payout_frequency,
      day_count_convention: row.day_count_convention,
      capitalization_policy: row.capitalization_policy
    },
    stats: {
      yield_confirmed_cents: b.yield_confirmed_cents,
      yield_paid_cents: b.yield_paid_cents,
      yield_reinvested_cents: b.yield_reinvested_cents,
      yield_pending_cents: b.yield_pending_cents
    }
  };
}

/** Detalle (forma del contrato: { investment, balance }). `includeInternal` agrega datos solo para administración. */
export function toDetail(row: InvestmentRow, b: Balance, includeInternal: { investor_name: string | null } | null) {
  return {
    investment: {
      id: row.id,
      code: row.code,
      investment_type: row.investment_type,
      status: row.status,
      currency: row.currency,
      start_date: row.start_date,
      maturity_date: row.maturity_date,
      initial_capital_cents: row.initial_capital_cents,
      current_capital_cents: row.current_capital_cents,
      terms: {
        fixed_annual_rate_bps: row.fixed_annual_rate_bps,
        payout_frequency: row.payout_frequency,
        day_count_convention: row.day_count_convention,
        capitalization_policy: row.capitalization_policy
      },
      ...(includeInternal
        ? { investor_user_id: row.investor_user_id, investor_name: includeInternal.investor_name, notes: row.notes ?? null }
        : {})
    },
    balance: b
  };
}

/** Partidas de una inversión con su saldo (para asignar pagos, reversar o reinvertir). */
export async function yieldEntriesWithSettlement(db: D1Database, investmentId: string, pendingOnly: boolean) {
  const rows = await db
    .prepare(
      `SELECT y.id, y.investment_id, y.period_start, y.period_end, y.amount_cents, y.status, y.source,
              COALESCE(y.note, y.reversal_reason) AS note, y.created_at,
              ${PAID_BY_YIELD} AS paid_cents, ${REINVESTED_BY_YIELD} AS reinvested_cents
       FROM yield_entries y WHERE y.investment_id = ?
       ORDER BY y.period_end DESC, y.created_at DESC`
    )
    .bind(investmentId)
    .all<{ id: string; investment_id: string; period_start: string; period_end: string; amount_cents: number; status: string; source: string; note: string | null; created_at: string; paid_cents: number; reinvested_cents: number }>();
  const items = rows.results.map((r) => ({
    ...r,
    pending_cents: r.status === 'CONFIRMED' && r.amount_cents > 0 ? Math.max(0, r.amount_cents - r.paid_cents - r.reinvested_cents) : 0
  }));
  return pendingOnly ? items.filter((r) => r.pending_cents > 0) : items;
}

export type HistoryType = 'ALL' | 'YIELDS' | 'PAYMENTS' | 'CAPITAL';

/** Historial unificado y paginado en SQL (no se cargan todas las transacciones). */
export async function investmentHistory(db: D1Database, investmentId: string, type: HistoryType, page: number, pageSize: number) {
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (type === 'ALL' || type === 'YIELDS') {
    parts.push(`SELECT 'YIELD' AS entry_type, y.id, y.period_end AS sort_date, y.period_start, y.period_end, y.amount_cents, y.status, y.source,
                  ${PAID_BY_YIELD} AS paid_amount_cents, ${REINVESTED_BY_YIELD} AS reinvested_cents, NULL AS reference, y.note AS note, y.created_at
                FROM yield_entries y WHERE y.investment_id = ? AND y.status = 'CONFIRMED'`);
    binds.push(investmentId);
  }
  if (type === 'ALL' || type === 'PAYMENTS') {
    parts.push(`SELECT 'PAYMENT' AS entry_type, p.id AS id, p.paid_at AS sort_date, NULL AS period_start, NULL AS period_end,
                  p.amount_cents AS amount_cents, p.status AS status, NULL AS source, NULL AS paid_amount_cents, NULL AS reinvested_cents,
                  p.reference AS reference, NULL AS note, p.created_at AS created_at
                FROM payment_records p WHERE p.investment_id = ? AND p.status = 'CONFIRMED'`);
    binds.push(investmentId);
  }
  if (type === 'ALL' || type === 'CAPITAL') {
    parts.push(`SELECT 'CAPITAL' AS entry_type, m.id AS id, m.effective_date AS sort_date, NULL AS period_start, NULL AS period_end,
                  CASE WHEN m.movement_type = 'CAPITAL_WITHDRAWAL' THEN -m.amount_cents ELSE m.amount_cents END AS amount_cents,
                  'CONFIRMED' AS status, m.movement_type AS source, NULL AS paid_amount_cents, NULL AS reinvested_cents,
                  NULL AS reference, NULL AS note, m.created_at AS created_at
                FROM capital_movements m WHERE m.investment_id = ?`);
    binds.push(investmentId);
  }
  const union = parts.join(' UNION ALL ');
  const totalRow = await db.prepare(`SELECT COUNT(*) AS n FROM (${union})`).bind(...binds).first<{ n: number }>();
  const rows = await db
    .prepare(`SELECT * FROM (${union}) ORDER BY sort_date DESC, created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, (page - 1) * pageSize)
    .all<Record<string, unknown>>();

  const capitalNote: Record<string, string> = {
    INITIAL_DEPOSIT: 'Capital inicial',
    CAPITAL_CONTRIBUTION: 'Aportación de capital',
    CAPITAL_WITHDRAWAL: 'Devolución de capital',
    REINVESTMENT_CREDIT: 'Reinversión de rendimiento'
  };
  const data = rows.results.map((r) => {
    const t = r.entry_type as 'YIELD' | 'PAYMENT' | 'CAPITAL';
    if (t === 'YIELD') {
      const amount = Number(r.amount_cents);
      const paid = Number(r.paid_amount_cents);
      const reinv = Number(r.reinvested_cents);
      return {
        entry_type: t, id: r.id, effective_date: r.sort_date, period_start: r.period_start, period_end: r.period_end,
        amount_cents: amount, status: r.status, source: r.source, paid_amount_cents: paid,
        pending_amount_cents: amount > 0 ? Math.max(0, amount - paid - reinv) : 0,
        note: reinv > 0 ? 'Reinvertido a capital según contrato' : (r.note ?? null)
      };
    }
    if (t === 'PAYMENT') {
      return {
        entry_type: t, id: r.id, effective_date: contractDateOf(String(r.sort_date)), amount_cents: r.amount_cents,
        status: r.status, reference: r.reference, note: 'Transferencia externa confirmada por la administración'
      };
    }
    return { entry_type: t, id: r.id, effective_date: r.sort_date, amount_cents: r.amount_cents, status: 'CONFIRMED', note: capitalNote[String(r.source)] ?? 'Movimiento de capital' };
  });
  return { data, total: totalRow?.n ?? 0 };
}

/** Serie para la gráfica: capital escalonado y rendimiento confirmado por periodo, ya desglosado. */
export async function investmentSeries(db: D1Database, inv: { id: string; status: string; maturity_date: string }) {
  const movements = await db
    .prepare(
      `SELECT effective_date, SUM(CASE WHEN movement_type = 'CAPITAL_WITHDRAWAL' THEN -amount_cents ELSE amount_cents END) AS delta
       FROM capital_movements WHERE investment_id = ? GROUP BY effective_date ORDER BY effective_date`
    )
    .bind(inv.id)
    .all<{ effective_date: string; delta: number }>();
  const today = todayInContractZone();
  let capital = 0;
  const capital_points = movements.results.map((m) => {
    capital += m.delta;
    return { date: m.effective_date, capital_cents: capital };
  });
  const lastDate = inv.status === 'ACTIVE' && today < inv.maturity_date ? today : inv.maturity_date;
  if (capital_points.length && capital_points[capital_points.length - 1]!.date < lastDate) capital_points.push({ date: lastDate, capital_cents: capital });

  const periods = await db
    .prepare(
      `SELECT y.period_start, y.period_end, SUM(y.amount_cents) AS confirmed_cents,
              SUM(${PAID_BY_YIELD}) AS paid_cents, SUM(${REINVESTED_BY_YIELD}) AS reinvested_cents
       FROM yield_entries y WHERE y.investment_id = ? AND y.status = 'CONFIRMED'
       GROUP BY y.period_start, y.period_end ORDER BY y.period_end`
    )
    .bind(inv.id)
    .all<{ period_start: string; period_end: string; confirmed_cents: number; paid_cents: number; reinvested_cents: number }>();
  const yield_periods = periods.results.map((p) => ({
    ...p,
    pending_cents: Math.max(0, p.confirmed_cents - p.paid_cents - p.reinvested_cents)
  }));
  return { as_of_date: today, capital_points, yield_periods };
}
