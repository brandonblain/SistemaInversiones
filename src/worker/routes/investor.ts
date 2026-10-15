// Rutas del Portal de Inversionista (Acceso Estricto por Titular)
import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import { getDocumentStream } from '../services/documents';
import { getInvestmentFinancialSummary } from '../services/payment-ledger';
import type { Env, AppVariables } from '../index';

export const investorRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

investorRoutes.use('*', authMiddleware, requireRole('INVESTOR'));

// 1. Resumen Consolidado de Inversiones del Titular
investorRoutes.get('/summary', async (c) => {
  const user = c.get('user');

  // Obtener todas las inversiones del usuario
  const investments = await c.env.DB.prepare(
    "SELECT id, current_capital_cents FROM investments WHERE investor_user_id = ? AND status = 'ACTIVE'"
  ).bind(user.id).all<{ id: string; current_capital_cents: number }>();

  let totalCapitalCents = 0;
  let totalYieldGeneratedCents = 0;
  let totalYieldConfirmedCents = 0;
  let totalYieldPaidCents = 0;
  let totalYieldReinvestedCents = 0;
  let totalYieldPendingCents = 0;

  for (const inv of investments.results) {
    const summary = await getInvestmentFinancialSummary(c.env.DB, inv.id);
    totalCapitalCents += summary.capitalVigenteCents;
    totalYieldGeneratedCents += summary.rendimientoDevengadoCents;
    totalYieldConfirmedCents += summary.rendimientoConfirmadoCents;
    totalYieldPaidCents += summary.rendimientoPagadoCents;
    totalYieldReinvestedCents += summary.rendimientoReinvertidoCents;
    totalYieldPendingCents += summary.rendimientoPendienteCents;
  }

  const todayStr = new Date().toISOString().split('T')[0];

  return c.json({
    success: true,
    data: {
      currency: c.env.DEFAULT_CURRENCY || 'MXN',
      total_capital_cents: totalCapitalCents,
      total_yield_generated_cents: totalYieldGeneratedCents,
      total_yield_confirmed_cents: totalYieldConfirmedCents,
      total_yield_paid_cents: totalYieldPaidCents,
      total_yield_reinvested_cents: totalYieldReinvestedCents,
      total_yield_pending_cents: totalYieldPendingCents,
      active_investments_count: investments.results.length,
      as_of_date: todayStr
    }
  });
});

// 2. Lista Paginada de Inversiones del Titular
investorRoutes.get('/investments', async (c) => {
  const user = c.get('user');
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '10', 10)));
  const offset = (page - 1) * pageSize;

  const totalRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM investments WHERE investor_user_id = ?'
  ).bind(user.id).first<{ count: number }>();
  const total = totalRow?.count || 0;

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.code, i.status, i.currency, i.start_date, i.maturity_date, i.current_capital_cents,
            t.fixed_annual_rate_bps, t.payout_frequency, t.day_count_convention, t.capitalization_policy
     FROM investments i
     LEFT JOIN investment_terms t ON i.id = t.investment_id AND t.effective_to IS NULL
     WHERE i.investor_user_id = ?
     ORDER BY i.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(user.id, pageSize, offset).all<Record<string, unknown>>();

  const items = await Promise.all(
    rows.results.map(async (row) => {
      const summary = await getInvestmentFinancialSummary(c.env.DB, String(row.id));
      return {
        id: row.id,
        code: row.code,
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
          yield_confirmed_cents: summary.rendimientoConfirmadoCents,
          yield_paid_cents: summary.rendimientoPagadoCents,
          yield_reinvested_cents: summary.rendimientoReinvertidoCents,
          yield_pending_cents: summary.rendimientoPendienteCents
        }
      };
    })
  );

  return c.json({
    success: true,
    data: items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize)
    }
  });
});

// 3. Detalle de Inversión (Aislamiento Estricto por Titular)
investorRoutes.get('/investments/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const inv = await c.env.DB.prepare(
    `SELECT i.id, i.investor_user_id, i.code, i.status, i.currency, i.start_date, i.maturity_date,
            i.initial_capital_cents, i.current_capital_cents, i.notes,
            t.fixed_annual_rate_bps, t.payout_frequency, t.day_count_convention, t.capitalization_policy
     FROM investments i
     LEFT JOIN investment_terms t ON i.id = t.investment_id AND t.effective_to IS NULL
     WHERE i.id = ?`
  ).bind(id).first<Record<string, unknown>>();

  if (!inv) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Inversión no encontrada.' } }, 404);
  }

  // Aislamiento: si es inversionista, debe ser el titular de la inversión
  if (user.role === 'INVESTOR' && String(inv.investor_user_id) !== user.id) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acceso no autorizado a esta inversión.' } }, 403);
  }

  const summary = await getInvestmentFinancialSummary(c.env.DB, id);

  return c.json({
    success: true,
    data: {
      investment: {
        id: inv.id,
        code: inv.code,
        status: inv.status,
        currency: inv.currency,
        start_date: inv.start_date,
        maturity_date: inv.maturity_date,
        initial_capital_cents: inv.initial_capital_cents,
        current_capital_cents: inv.current_capital_cents,
        notes: inv.notes,
        terms: {
          fixed_annual_rate_bps: inv.fixed_annual_rate_bps,
          payout_frequency: inv.payout_frequency,
          day_count_convention: inv.day_count_convention,
          capitalization_policy: inv.capitalization_policy
        }
      },
      summary
    }
  });
});

// 4. Historial Financiero Paginado de la Inversión
investorRoutes.get('/investments/:id/history', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // Validar titularidad
  const inv = await c.env.DB.prepare('SELECT investor_user_id FROM investments WHERE id = ?').bind(id).first<{ investor_user_id: string }>();
  if (!inv) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Inversión no encontrada.' } }, 404);
  }
  if (user.role === 'INVESTOR' && inv.investor_user_id !== user.id) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado.' } }, 403);
  }

  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;

  // Rendimientos confirmados y pagos
  const yields = await c.env.DB.prepare(
    `SELECT id, 'YIELD' as entry_type, period_end as effective_date, period_start, period_end,
            amount_cents, status, source, calculation_version, created_at, reversal_reason as note
     FROM yield_entries
     WHERE investment_id = ? AND status = 'CONFIRMED'
     ORDER BY period_end DESC
     LIMIT ? OFFSET ?`
  ).bind(id, pageSize, offset).all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: yields.results,
    pagination: {
      page,
      pageSize,
      total: yields.results.length,
      totalPages: 1
    }
  });
});

// 5. Lista de Documentos Privados de la Inversión
investorRoutes.get('/investments/:id/documents', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const inv = await c.env.DB.prepare('SELECT investor_user_id FROM investments WHERE id = ?').bind(id).first<{ investor_user_id: string }>();
  if (!inv) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Inversión no encontrada.' } }, 404);
  }
  if (user.role === 'INVESTOR' && inv.investor_user_id !== user.id) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acceso denegado.' } }, 403);
  }

  const docs = await c.env.DB.prepare(
    `SELECT id, title, document_type, original_filename, size_bytes, content_type, created_at
     FROM investment_documents
     WHERE investment_id = ? AND is_archived = 0
     ORDER BY created_at DESC`
  ).bind(id).all();

  return c.json({ success: true, data: docs.results });
});

// 6. Descarga Segura de Documento Privado desde R2
investorRoutes.get('/documents/:id/download', async (c) => {
  const user = c.get('user');
  const documentId = c.req.param('id');

  try {
    const doc = await getDocumentStream(c.env.DB, c.env.DOCS_BUCKET, documentId, user.id, user.role);

    return new Response(doc.body, {
      status: 200,
      headers: {
        'Content-Type': doc.contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.originalFilename)}"`,
        'Content-Length': String(doc.sizeBytes),
        'Cache-Control': 'private, no-store, no-cache, must-revalidate'
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al obtener el documento.';
    const status = msg.includes('No autorizado') ? 403 : 404;
    return c.json({ success: false, error: { code: 'DOCUMENT_ERROR', message: msg } }, status);
  }
});
