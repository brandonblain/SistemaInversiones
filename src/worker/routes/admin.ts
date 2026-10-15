// Rutas Administrativas del Portal de Inversionistas
import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../middleware/auth';
import { hashPassword, generateSecureToken } from '../services/crypto';
import { recordAuditLog } from '../services/audit';
import { calculateYieldDeterministic } from '../services/yield-calculator';
import { recordCapitalMovement } from '../services/capital-ledger';
import {
  confirmYieldEntry,
  recordManualYield,
  reverseYieldEntry,
  recordExternalPayment,
  executeReinvestment
} from '../services/payment-ledger';
import { uploadPrivateDocument } from '../services/documents';
import type { Env, AppVariables } from '../index';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

adminRoutes.use('*', authMiddleware, requireRole('ADMIN'));

// ==========================================
// 1. Gestión de Inversionistas y Cuentas
// ==========================================

adminRoutes.get('/investors', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;

  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM users WHERE role = 'INVESTOR'"
  ).first<{ count: number }>();
  const total = totalRow?.count || 0;

  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.email, u.is_active, u.created_at,
            p.id as profile_id, p.full_name, p.rfc, p.phone, p.address,
            COUNT(i.id) as investments_count
     FROM users u
     LEFT JOIN investor_profiles p ON u.id = p.user_id
     LEFT JOIN investments i ON u.id = i.investor_user_id
     WHERE u.role = 'INVESTOR'
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(pageSize, offset).all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: rows.results,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  });
});

adminRoutes.post('/investors', async (c) => {
  const admin = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.email || !body.password || !body.full_name) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Email, contraseña y nombre completo son requeridos.' }
    }, 400);
  }

  const email = String(body.email).toLowerCase().trim();
  const password = String(body.password);
  const fullName = String(body.full_name).trim();

  // Validar si el email ya existe
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return c.json({ success: false, error: { code: 'EMAIL_ALREADY_EXISTS', message: 'El correo electrónico ya está registrado.' } }, 409);
  }

  const userId = generateSecureToken('usr');
  const profileId = generateSecureToken('prof');
  const passwordHash = await hashPassword(password);

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, password_hash, role, is_active)
     VALUES (?, ?, ?, 'INVESTOR', 1)`
  ).bind(userId, email, passwordHash).run();

  await c.env.DB.prepare(
    `INSERT INTO investor_profiles (id, user_id, full_name, rfc, phone, address, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    profileId,
    userId,
    fullName,
    body.rfc ? String(body.rfc).toUpperCase().trim() : null,
    body.phone ? String(body.phone).trim() : null,
    body.address ? String(body.address).trim() : null,
    body.notes ? String(body.notes).trim() : null
  ).run();

  await recordAuditLog(c.env.DB, {
    userId: admin.id,
    action: 'INVESTOR_CREATED',
    entityType: 'USER',
    entityId: userId,
    newValues: { email, full_name: fullName, profile_id: profileId }
  });

  return c.json({
    success: true,
    data: {
      user_id: userId,
      profile_id: profileId,
      email,
      full_name: fullName
    }
  }, 201);
});

// ==========================================
// 2. Gestión de Inversiones y Contratos
// ==========================================

adminRoutes.get('/investments', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;

  const totalRow = await c.env.DB.prepare('SELECT COUNT(*) as count FROM investments').first<{ count: number }>();
  const total = totalRow?.count || 0;

  const rows = await c.env.DB.prepare(
    `SELECT i.id, i.investor_user_id, i.code, i.status, i.currency, i.start_date, i.maturity_date,
            i.initial_capital_cents, i.current_capital_cents,
            p.full_name as investor_name, u.email as investor_email,
            t.fixed_annual_rate_bps, t.payout_frequency, t.day_count_convention, t.capitalization_policy
     FROM investments i
     JOIN users u ON i.investor_user_id = u.id
     LEFT JOIN investor_profiles p ON u.id = p.user_id
     LEFT JOIN investment_terms t ON i.id = t.investment_id AND t.effective_to IS NULL
     ORDER BY i.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(pageSize, offset).all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: rows.results,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  });
});

adminRoutes.post('/investments', async (c) => {
  const admin = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (
    !body ||
    !body.investor_user_id ||
    !body.code ||
    !body.start_date ||
    !body.maturity_date ||
    !body.capital_cents ||
    !body.fixed_annual_rate_bps ||
    !body.payout_frequency
  ) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'Faltan parámetros requeridos para crear la inversión.' }
    }, 400);
  }

  const capitalCents = Number(body.capital_cents);
  if (capitalCents <= 0 || !Number.isInteger(capitalCents)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_CAPITAL', message: 'El capital debe ser un número entero positivo en centavos.' }
    }, 400);
  }

  const rateBps = Number(body.fixed_annual_rate_bps);
  if (rateBps <= 0 || !Number.isInteger(rateBps)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_RATE', message: 'La tasa debe expresarse en puntos básicos enteros (ej. 1200 para 12.00%).' }
    }, 400);
  }

  const frequency = body.payout_frequency as 'MONTHLY' | 'SEMIANNUAL' | 'AT_MATURITY';
  if (!['MONTHLY', 'SEMIANNUAL', 'AT_MATURITY'].includes(frequency)) {
    return c.json({
      success: false,
      error: { code: 'INVALID_FREQUENCY', message: 'Modalidad de cobro inválida. Se espera MONTHLY, SEMIANNUAL o AT_MATURITY.' }
    }, 400);
  }

  const convention = (body.day_count_convention || 'ACT_365') as 'ACT_365' | 'ACT_360' | 'THIRTY_360';
  const capPolicy = (body.capitalization_policy || 'NONE') as 'NONE' | 'COMPOUND_TO_CAPITAL';

  const invId = generateSecureToken('inv');
  const termId = generateSecureToken('trm');

  // 1. Insertar inversión con saldo inicial 0 que se establece mediante el movimiento de depósito
  await c.env.DB.prepare(
    `INSERT INTO investments (
      id, investor_user_id, code, status, currency, start_date, maturity_date,
      initial_capital_cents, current_capital_cents, notes
    ) VALUES (?, ?, ?, 'ACTIVE', 'MXN', ?, ?, ?, 0, ?)`
  ).bind(
    invId,
    body.investor_user_id,
    String(body.code).trim(),
    body.start_date,
    body.maturity_date,
    capitalCents,
    body.notes ? String(body.notes).trim() : null
  ).run();

  // 2. Insertar términos contractuales
  await c.env.DB.prepare(
    `INSERT INTO investment_terms (
      id, investment_id, fixed_annual_rate_bps, payout_frequency,
      day_count_convention, capitalization_policy, effective_from
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    termId,
    invId,
    rateBps,
    frequency,
    convention,
    capPolicy,
    body.start_date
  ).run();

  // 3. Registrar movimiento de capital inicial
  await recordCapitalMovement(c.env.DB, {
    investmentId: invId,
    movementType: 'INITIAL_DEPOSIT',
    amountCents: capitalCents,
    effectiveDate: body.start_date,
    notes: 'Depósito de capital inicial según contrato de inversión',
    recordedByUserId: admin.id
  });

  await recordAuditLog(c.env.DB, {
    userId: admin.id,
    action: 'INVESTMENT_CREATED',
    entityType: 'INVESTMENT',
    entityId: invId,
    newValues: {
      code: body.code,
      investor_user_id: body.investor_user_id,
      capital_cents: capitalCents,
      rate_bps: rateBps,
      payout_frequency: frequency,
      day_count_convention: convention,
      capitalization_policy: capPolicy
    }
  });

  return c.json({
    success: true,
    data: {
      investment_id: invId,
      code: body.code,
      current_capital_cents: capitalCents
    }
  }, 201);
});

// ==========================================
// 3. Motor Financiero y Liquidación de Rendimientos
// ==========================================

// Previsualización sin persistencia
adminRoutes.post('/yields/preview', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !body.investment_id || !body.period_start || !body.period_end) {
    return c.json({
      success: false,
      error: { code: 'INVALID_INPUT', message: 'investment_id, period_start y period_end requeridos.' }
    }, 400);
  }

  const inv = await c.env.DB.prepare(
    'SELECT current_capital_cents FROM investments WHERE id = ?'
  ).bind(body.investment_id).first<{ current_capital_cents: number }>();

  if (!inv) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Inversión no encontrada.' } }, 404);
  }

  const terms = await c.env.DB.prepare(
    'SELECT fixed_annual_rate_bps, day_count_convention FROM investment_terms WHERE investment_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(body.investment_id).first<{ fixed_annual_rate_bps: number; day_count_convention: string }>();

  const rateBps = terms?.fixed_annual_rate_bps || 1200;
  const convention = (body.day_count_convention || terms?.day_count_convention || 'ACT_365') as 'ACT_365' | 'ACT_360' | 'THIRTY_360';

  const preview = calculateYieldDeterministic({
    capitalCents: inv.current_capital_cents,
    rateBps,
    startDate: body.period_start,
    endDate: body.period_end,
    convention
  });

  return c.json({ success: true, data: preview });
});

// Confirmación Idempotente
adminRoutes.post('/yields/confirm', async (c) => {
  const admin = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.investment_id || !body.period_start || !body.period_end) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Datos incompletos para confirmar el rendimiento.' } }, 400);
  }

  const inv = await c.env.DB.prepare(
    'SELECT current_capital_cents FROM investments WHERE id = ?'
  ).bind(body.investment_id).first<{ current_capital_cents: number }>();

  if (!inv) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Inversión no encontrada.' } }, 404);
  }

  const terms = await c.env.DB.prepare(
    'SELECT fixed_annual_rate_bps, day_count_convention FROM investment_terms WHERE investment_id = ? ORDER BY version DESC LIMIT 1'
  ).bind(body.investment_id).first<{ fixed_annual_rate_bps: number; day_count_convention: string }>();

  const rateBps = terms?.fixed_annual_rate_bps || 1200;
  const convention = (body.day_count_convention || terms?.day_count_convention || 'ACT_365') as 'ACT_365' | 'ACT_360' | 'THIRTY_360';

  const calc = calculateYieldDeterministic({
    capitalCents: inv.current_capital_cents,
    rateBps,
    startDate: body.period_start,
    endDate: body.period_end,
    convention
  });

  const amountCents = body.amount_cents ? Number(body.amount_cents) : calc.yieldCents;

  const result = await confirmYieldEntry(c.env.DB, {
    investmentId: body.investment_id,
    periodStart: body.period_start,
    periodEnd: body.period_end,
    daysCount: calc.daysCount,
    referenceCapitalCents: inv.current_capital_cents,
    rateBps,
    amountCents,
    source: 'AUTO',
    recordedByUserId: admin.id
  });

  return c.json({
    success: true,
    data: {
      yield_entry_id: result.id,
      is_existing: result.isExisting,
      amount_cents: result.amountCents
    }
  });
});

// Rendimiento manual / ajuste extraordinario
adminRoutes.post('/yields/manual', async (c) => {
  const admin = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.investment_id || !body.period_start || !body.period_end || !body.amount_cents || !body.reason) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Campos requeridos faltantes para rendimiento manual.' } }, 400);
  }

  const res = await recordManualYield(c.env.DB, {
    investmentId: body.investment_id,
    periodStart: body.period_start,
    periodEnd: body.period_end,
    amountCents: Number(body.amount_cents),
    reason: String(body.reason),
    recordedByUserId: admin.id
  });

  return c.json({ success: true, data: { yield_entry_id: res.id } });
});

// Reversión de rendimiento
adminRoutes.post('/yields/:id/reverse', async (c) => {
  const admin = c.get('user');
  const yieldId = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.reason) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'El motivo de la reversión es obligatorio.' } }, 400);
  }

  try {
    const res = await reverseYieldEntry(c.env.DB, yieldId, String(body.reason), admin.id);
    return c.json({ success: true, data: { reversal_entry_id: res.reversalId } });
  } catch (err: unknown) {
    return c.json({ success: false, error: { code: 'REVERSAL_ERROR', message: err instanceof Error ? err.message : 'Error al reversar partida.' } }, 400);
  }
});

// Registro de pago bancario externo con asignación parcial
adminRoutes.post('/payments', async (c) => {
  const admin = c.get('user');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.investment_id || !body.amount_cents || !body.paid_at || !body.reference || !Array.isArray(body.allocations)) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Datos incompletos para registrar pago externo.' } }, 400);
  }

  try {
    const res = await recordExternalPayment(c.env.DB, {
      investmentId: body.investment_id,
      amountCents: Number(body.amount_cents),
      paidAt: body.paid_at,
      reference: String(body.reference),
      notes: body.notes ? String(body.notes) : null,
      recordedByUserId: admin.id,
      allocations: body.allocations.map((a: { yield_entry_id?: string; yieldEntryId?: string; amount_cents?: number; amountCents?: number }) => ({
        yieldEntryId: String(a.yield_entry_id || a.yieldEntryId),
        amountCents: Number(a.amount_cents || a.amountCents)
      }))
    });

    return c.json({ success: true, data: { payment_id: res.paymentId } }, 201);
  } catch (err: unknown) {
    return c.json({ success: false, error: { code: 'PAYMENT_ERROR', message: err instanceof Error ? err.message : 'Error al registrar pago.' } }, 400);
  }
});

// Reinversión contractual
adminRoutes.post('/investments/:id/reinvest', async (c) => {
  const admin = c.get('user');
  const investmentId = c.req.param('id');
  const body = await c.req.json().catch(() => null);

  if (!body || !body.yield_entry_id || !body.effective_date) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'yield_entry_id y effective_date requeridos.' } }, 400);
  }

  try {
    const res = await executeReinvestment(c.env.DB, {
      investmentId,
      yieldEntryId: body.yield_entry_id,
      effectiveDate: body.effective_date,
      notes: body.notes ? String(body.notes) : null,
      recordedByUserId: admin.id
    });

    return c.json({ success: true, data: res });
  } catch (err: unknown) {
    return c.json({ success: false, error: { code: 'REINVESTMENT_ERROR', message: err instanceof Error ? err.message : 'Error al reinvertir.' } }, 400);
  }
});

// Carga de Documentos Privados R2
adminRoutes.post('/investments/:id/documents', async (c) => {
  const admin = c.get('user');
  const investmentId = c.req.param('id');

  const formData = await c.req.formData().catch(() => null);
  if (!formData) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Se espera multipart/form-data.' } }, 400);
  }

  const file = formData.get('file') as File | null;
  const title = formData.get('title') as string | null;
  const documentType = (formData.get('document_type') as string | null) || 'CONTRACT';

  if (!file || !title) {
    return c.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Archivo (file) y título (title) son obligatorios.' } }, 400);
  }

  try {
    const buffer = await file.arrayBuffer();
    const res = await uploadPrivateDocument(c.env.DB, c.env.DOCS_BUCKET, {
      investmentId,
      title: title.trim(),
      documentType: documentType as 'CONTRACT' | 'ADDENDUM' | 'ACCOUNT_STATEMENT' | 'TAX_RECEIPT' | 'OTHER',
      originalFilename: file.name,
      contentType: file.type || 'application/pdf',
      fileBuffer: buffer,
      uploadedByUserId: admin.id
    });

    return c.json({ success: true, data: res }, 201);
  } catch (err: unknown) {
    return c.json({ success: false, error: { code: 'UPLOAD_ERROR', message: err instanceof Error ? err.message : 'Error al subir archivo.' } }, 400);
  }
});

// Bitácora de Auditoría
adminRoutes.get('/audit-logs', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '20', 10)));
  const offset = (page - 1) * pageSize;

  const totalRow = await c.env.DB.prepare('SELECT COUNT(*) as count FROM audit_logs').first<{ count: number }>();
  const total = totalRow?.count || 0;

  const logs = await c.env.DB.prepare(
    `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id,
            a.old_values_json, a.new_values_json, a.ip_address, a.created_at,
            u.email as actor_email
     FROM audit_logs a
     LEFT JOIN users u ON a.user_id = u.id
     ORDER BY a.created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(pageSize, offset).all<Record<string, unknown>>();

  return c.json({
    success: true,
    data: logs.results,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
  });
});

import { runScheduledMaintenance } from '../services/scheduled-jobs';

adminRoutes.post('/jobs/run-maintenance', async (c) => {
  const result = await runScheduledMaintenance(c.env.DB, c.env.EMAIL_FROM);
  return c.json({ success: true, data: result });
});
