// Rutas del Portal de Inversionista. Solo lectura, aislamiento estricto por titular y SIN documentos
// (por decisión del cliente, los documentos son exclusivos de la administración).
import { Hono } from 'hono';
import { authMiddleware, requireInvestor } from '../middleware/auth';
import { AppError } from '../lib/errors';
import { todayInContractZone } from '../lib/dates';
import { pageParams, pagination } from '../lib/validate';
import {
  balancesFor,
  INVESTMENT_COLUMNS,
  investmentHistory,
  investmentSeries,
  TERMS_JOIN,
  toDetail,
  toListItem,
  type HistoryType,
  type InvestmentRow
} from '../services/read-models';
import type { Env, AppVariables } from '../index';

export const investorRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
investorRoutes.use('*', authMiddleware, requireInvestor);

const STATUSES = ['DRAFT', 'ACTIVE', 'MATURED', 'CANCELLED'];

/** Carga una inversión del titular. Responde 404 tanto si no existe como si es de otra persona (no revela existencia). */
async function ownInvestment(db: D1Database, userId: string, id: string): Promise<InvestmentRow> {
  const row = await db
    .prepare(`SELECT ${INVESTMENT_COLUMNS} FROM investments i ${TERMS_JOIN} WHERE i.id = ? AND i.investor_user_id = ?`)
    .bind(id, userId)
    .first<InvestmentRow>();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Inversión no encontrada.');
  return row;
}

// 1. Resumen consolidado (todas sus inversiones; el capital vigente solo cuenta inversiones vigentes)
investorRoutes.get('/summary', async (c) => {
  const user = c.get('user');
  const invs = await c.env.DB.prepare('SELECT id, status FROM investments WHERE investor_user_id = ?').bind(user.id).all<{ id: string; status: string }>();
  const balances = await balancesFor(c.env.DB, invs.results.map((i) => i.id));
  const total = { capital: 0, confirmed: 0, paid: 0, reinvested: 0, pending: 0 };
  for (const inv of invs.results) {
    const b = balances.get(inv.id);
    if (!b) continue;
    if (inv.status === 'ACTIVE') total.capital += b.capital_cents;
    total.confirmed += b.yield_confirmed_cents;
    total.paid += b.yield_paid_cents;
    total.reinvested += b.yield_reinvested_cents;
    total.pending += b.yield_pending_cents;
  }
  return c.json({
    success: true,
    data: {
      currency: 'MXN',
      total_capital_cents: total.capital,
      total_yield_generated_cents: total.confirmed,
      total_yield_confirmed_cents: total.confirmed,
      total_yield_paid_cents: total.paid,
      total_yield_reinvested_cents: total.reinvested,
      total_yield_pending_cents: total.pending,
      active_investments_count: invs.results.filter((i) => i.status === 'ACTIVE').length,
      as_of_date: todayInContractZone()
    }
  });
});

// 2. Lista paginada de sus inversiones (?status=)
investorRoutes.get('/investments', async (c) => {
  const user = c.get('user');
  const { page, pageSize, offset } = pageParams(c, 10);
  const status = c.req.query('status') ?? '';
  if (status && !STATUSES.includes(status)) throw new AppError(400, 'INVALID_INPUT', 'Estado no válido.');

  const where = `i.investor_user_id = ?${status ? ' AND i.status = ?' : ''}`;
  const binds: unknown[] = status ? [user.id, status] : [user.id];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM investments i WHERE ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(`SELECT ${INVESTMENT_COLUMNS} FROM investments i ${TERMS_JOIN} WHERE ${where} ORDER BY i.start_date DESC, i.created_at DESC LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all<InvestmentRow>();
  const balances = await balancesFor(c.env.DB, rows.results.map((r) => r.id));
  return c.json({
    success: true,
    data: rows.results.map((r) => toListItem(r, balances.get(r.id))),
    pagination: pagination(page, pageSize, total?.n ?? 0)
  });
});

// 3. Detalle con saldo desglosado (sin notas internas)
investorRoutes.get('/investments/:id', async (c) => {
  const row = await ownInvestment(c.env.DB, c.get('user').id, c.req.param('id'));
  const b = (await balancesFor(c.env.DB, [row.id])).get(row.id)!;
  return c.json({ success: true, data: toDetail(row, b, null) });
});

// 4. Historial paginado (?type=ALL|YIELDS|PAYMENTS|CAPITAL)
investorRoutes.get('/investments/:id/history', async (c) => {
  const row = await ownInvestment(c.env.DB, c.get('user').id, c.req.param('id'));
  const { page, pageSize } = pageParams(c, 20);
  const type = (c.req.query('type') ?? 'ALL').toUpperCase() as HistoryType;
  if (!['ALL', 'YIELDS', 'PAYMENTS', 'CAPITAL'].includes(type)) throw new AppError(400, 'INVALID_INPUT', 'Tipo de historial no válido.');
  const { data, total } = await investmentHistory(c.env.DB, row.id, type, page, pageSize);
  return c.json({ success: true, data, pagination: pagination(page, pageSize, total) });
});

// 5. Serie para la gráfica de evolución
investorRoutes.get('/investments/:id/series', async (c) => {
  const row = await ownInvestment(c.env.DB, c.get('user').id, c.req.param('id'));
  return c.json({ success: true, data: await investmentSeries(c.env.DB, { id: row.id, status: String(row.status), maturity_date: String(row.maturity_date) }) });
});

// 6. Avisos enviados (sin cuerpo del correo; sin avisos de documentos)
investorRoutes.get('/notifications', async (c) => {
  const user = c.get('user');
  const { page, pageSize, offset } = pageParams(c, 20);
  const where = "user_id = ? AND event_type != 'DOCUMENT_UPLOADED'";
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notification_events WHERE ${where}`).bind(user.id).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(`SELECT id, event_type, subject, status, created_at FROM notification_events WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .bind(user.id, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});
