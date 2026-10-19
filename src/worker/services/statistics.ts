// Estadísticas de administración (generales o de un solo cliente). Todo se calcula en el servidor y
// SIEMPRE por moneda: pesos y dólares nunca se suman entre sí.
import { addDays, addMonthsClamped, todayInContractZone } from '../lib/dates';
import { balancesFor } from './read-models';

interface InvRow {
  id: string;
  code: string;
  investor_user_id: string;
  investor_name: string | null;
  investor_email: string;
  currency: string;
  status: string;
  investment_type: string;
  initial_capital_cents: number;
  current_capital_cents: number;
  maturity_date: string;
  payout_frequency: string;
  rate_type: string;
  fixed_annual_rate_bps: number | null;
}

const emptyTotals = (currency: string) => ({
  currency,
  investors_count: 0,
  investments_active: 0,
  investments_matured: 0,
  investments_total: 0,
  initial_capital_cents: 0,
  capital_cents: 0,
  yield_confirmed_cents: 0,
  yield_paid_cents: 0,
  yield_reinvested_cents: 0,
  yield_pending_cents: 0,
  /** Tasa fija promedio ponderada por capital vigente (solo inversiones vigentes de tasa fija). */
  weighted_fixed_rate_bps: null as number | null
});

export async function adminStatistics(db: D1Database, investorId: string | null) {
  const today = todayInContractZone();
  const where = investorId ? 'WHERE i.investor_user_id = ?' : '';
  const binds = investorId ? [investorId] : [];
  const rows = (
    await db
      .prepare(
        `SELECT i.id, i.code, i.investor_user_id, p.full_name AS investor_name, u.email AS investor_email, i.currency, i.status,
                i.investment_type, i.initial_capital_cents, i.current_capital_cents, i.maturity_date,
                t.payout_frequency, t.rate_type, t.fixed_annual_rate_bps
         FROM investments i
         JOIN users u ON u.id = i.investor_user_id
         LEFT JOIN investor_profiles p ON p.user_id = i.investor_user_id
         LEFT JOIN investment_terms t ON t.investment_id = i.id AND t.effective_to IS NULL
         ${where}`
      )
      .bind(...binds)
      .all<InvRow>()
  ).results;
  const balances = await balancesFor(db, rows.map((r) => r.id));

  // ---- Totales por moneda ----
  const totals = new Map<string, ReturnType<typeof emptyTotals>>();
  const investorsByCurrency = new Map<string, Set<string>>();
  const rateAcc = new Map<string, { weighted: bigint; capital: bigint }>();
  const byType = new Map<string, { currency: string; investment_type: string; investments_count: number; capital_cents: number; yield_confirmed_cents: number }>();
  const byPayout = new Map<string, { currency: string; payout_frequency: string; investments_count: number; capital_cents: number }>();
  const perInvestor = new Map<string, {
    user_id: string; full_name: string | null; email: string; currency: string; investments_count: number; active_count: number;
    capital_cents: number; yield_confirmed_cents: number; yield_paid_cents: number; yield_reinvested_cents: number; yield_pending_cents: number;
    next_maturity: string | null;
  }>();

  for (const r of rows) {
    const b = balances.get(r.id)!;
    const t = totals.get(r.currency) ?? emptyTotals(r.currency);
    const active = r.status === 'ACTIVE';
    t.investments_total += 1;
    if (active) t.investments_active += 1;
    if (r.status === 'MATURED') t.investments_matured += 1;
    t.initial_capital_cents += r.initial_capital_cents;
    if (active) t.capital_cents += b.capital_cents;
    t.yield_confirmed_cents += b.yield_confirmed_cents;
    t.yield_paid_cents += b.yield_paid_cents;
    t.yield_reinvested_cents += b.yield_reinvested_cents;
    t.yield_pending_cents += b.yield_pending_cents;
    totals.set(r.currency, t);

    const set = investorsByCurrency.get(r.currency) ?? new Set<string>();
    set.add(r.investor_user_id);
    investorsByCurrency.set(r.currency, set);

    if (active && r.rate_type === 'FIXED' && r.fixed_annual_rate_bps) {
      const acc = rateAcc.get(r.currency) ?? { weighted: 0n, capital: 0n };
      acc.weighted += BigInt(b.capital_cents) * BigInt(r.fixed_annual_rate_bps);
      acc.capital += BigInt(b.capital_cents);
      rateAcc.set(r.currency, acc);
    }

    const tk = `${r.currency}|${r.investment_type}`;
    const ty = byType.get(tk) ?? { currency: r.currency, investment_type: r.investment_type, investments_count: 0, capital_cents: 0, yield_confirmed_cents: 0 };
    ty.investments_count += 1;
    if (active) ty.capital_cents += b.capital_cents;
    ty.yield_confirmed_cents += b.yield_confirmed_cents;
    byType.set(tk, ty);

    const pk = `${r.currency}|${r.payout_frequency}`;
    const po = byPayout.get(pk) ?? { currency: r.currency, payout_frequency: r.payout_frequency, investments_count: 0, capital_cents: 0 };
    po.investments_count += 1;
    if (active) po.capital_cents += b.capital_cents;
    byPayout.set(pk, po);

    const ik = `${r.investor_user_id}|${r.currency}`;
    const iv = perInvestor.get(ik) ?? {
      user_id: r.investor_user_id, full_name: r.investor_name, email: r.investor_email, currency: r.currency, investments_count: 0, active_count: 0,
      capital_cents: 0, yield_confirmed_cents: 0, yield_paid_cents: 0, yield_reinvested_cents: 0, yield_pending_cents: 0, next_maturity: null
    };
    iv.investments_count += 1;
    if (active) {
      iv.active_count += 1;
      iv.capital_cents += b.capital_cents;
      if (r.maturity_date >= today && (!iv.next_maturity || r.maturity_date < iv.next_maturity)) iv.next_maturity = r.maturity_date;
    }
    iv.yield_confirmed_cents += b.yield_confirmed_cents;
    iv.yield_paid_cents += b.yield_paid_cents;
    iv.yield_reinvested_cents += b.yield_reinvested_cents;
    iv.yield_pending_cents += b.yield_pending_cents;
    perInvestor.set(ik, iv);
  }

  for (const [cur, t] of totals) {
    t.investors_count = investorsByCurrency.get(cur)?.size ?? 0;
    const acc = rateAcc.get(cur);
    // Redondeo half-up exacto
    t.weighted_fixed_rate_bps = acc && acc.capital > 0n ? Number((acc.weighted + acc.capital / 2n) / acc.capital) : null;
  }

  // ---- Serie mensual (últimos 12 meses): rendimiento confirmado por mes de cierre y pagos por mes (hora de CDMX) ----
  const fromMonth = addMonthsClamped(`${today.slice(0, 7)}-01`, -11);
  const scope = investorId ? 'AND i.investor_user_id = ?' : '';
  const monthlyYields = await db
    .prepare(
      `SELECT i.currency, substr(y.period_end, 1, 7) AS month, SUM(y.amount_cents) AS cents
       FROM yield_entries y JOIN investments i ON i.id = y.investment_id
       WHERE y.status = 'CONFIRMED' AND y.period_end >= ? ${scope}
       GROUP BY i.currency, month`
    )
    .bind(fromMonth, ...binds)
    .all<{ currency: string; month: string; cents: number }>();
  const monthlyPayments = await db
    .prepare(
      `SELECT i.currency, substr(datetime(pr.paid_at, '-6 hours'), 1, 7) AS month, SUM(pr.amount_cents) AS cents
       FROM payment_records pr JOIN investments i ON i.id = pr.investment_id
       WHERE pr.status = 'CONFIRMED' AND datetime(pr.paid_at, '-6 hours') >= ? ${scope}
       GROUP BY i.currency, month`
    )
    .bind(fromMonth, ...binds)
    .all<{ currency: string; month: string; cents: number }>();

  const months: string[] = [];
  for (let k = 0; k < 12; k++) months.push(addMonthsClamped(fromMonth, k).slice(0, 7));
  const monthly: Array<{ currency: string; month: string; yield_confirmed_cents: number; paid_cents: number }> = [];
  for (const cur of totals.keys()) {
    for (const m of months) {
      monthly.push({
        currency: cur,
        month: m,
        yield_confirmed_cents: monthlyYields.results.find((x) => x.currency === cur && x.month === m)?.cents ?? 0,
        paid_cents: monthlyPayments.results.find((x) => x.currency === cur && x.month === m)?.cents ?? 0
      });
    }
  }

  // ---- Vencimientos de los próximos 90 días ----
  const limit = addDays(today, 90);
  const upcoming = rows
    .filter((r) => r.status === 'ACTIVE' && r.maturity_date >= today && r.maturity_date <= limit)
    .sort((a, b) => a.maturity_date.localeCompare(b.maturity_date))
    .map((r) => ({
      investment_id: r.id, code: r.code, investor_user_id: r.investor_user_id, investor_name: r.investor_name,
      currency: r.currency, maturity_date: r.maturity_date, capital_cents: balances.get(r.id)!.capital_cents
    }));

  const currencyOrder = (a: { currency: string }, b: { currency: string }) => (a.currency === b.currency ? 0 : a.currency === 'MXN' ? -1 : b.currency === 'MXN' ? 1 : a.currency.localeCompare(b.currency));
  return {
    as_of_date: today,
    totals: [...totals.values()].sort(currencyOrder),
    by_type: [...byType.values()].sort((a, b) => currencyOrder(a, b) || b.capital_cents - a.capital_cents),
    by_payout: [...byPayout.values()].sort((a, b) => currencyOrder(a, b) || b.capital_cents - a.capital_cents),
    monthly,
    upcoming_maturities: upcoming,
    investors: [...perInvestor.values()].sort((a, b) => currencyOrder(a, b) || b.capital_cents - a.capital_cents)
  };
}
