// Rutas Administrativas (rol ADMIN + MFA obligatorio). Toda escritura financiera es atómica y auditada.
import { Hono } from 'hono';
import { authMiddleware, clientIp, requireAdmin } from '../middleware/auth';
import { AppError, badRequest, withDb } from '../lib/errors';
import { addDays, todayInContractZone } from '../lib/dates';
import { assertPassword, date, dateTime, int, isEmail, likePattern, oneOf, optStr, pageParams, pagination, readJson, str, type Body } from '../lib/validate';
import { auditStatement } from '../services/audit';
import { generateSecureToken, hashPassword } from '../services/crypto';
import { archiveDocument, DOCUMENT_TYPES, getDocumentForAdmin, uploadPrivateDocument } from '../services/documents';
import { confirmYield, executeReinvestment, previewYield, recordExternalPayment, recordManualYield, reverseYieldEntry } from '../services/payment-ledger';
import { balancesFor, INVESTMENT_COLUMNS, TERMS_JOIN, toDetail, toListItem, yieldEntriesWithSettlement, type InvestmentRow } from '../services/read-models';
import { runScheduledMaintenance } from '../services/scheduled-jobs';
import type { Env, AppVariables } from '../index';

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();
adminRoutes.use('*', authMiddleware, requireAdmin);

const INVESTMENT_TYPES = ['FAST_FOOD', 'MOBILITY', 'TRANSPORT'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'MATURED', 'CANCELLED'] as const;
const PAYOUTS = ['MONTHLY', 'SEMIANNUAL', 'AT_MATURITY'] as const;
const CONVENTIONS = ['ACT_365', 'ACT_360', 'THIRTY_360'] as const;
const CAP_POLICIES = ['NONE', 'COMPOUND_TO_CAPITAL'] as const;
const RELATIONSHIPS = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER'] as const;
const MAX_CAPITAL_CENTS = 1_000_000_000_000; // $10,000,000,000.00

// ======================================================================
// Resumen
// ======================================================================
adminRoutes.get('/summary', async (c) => {
  const db = c.env.DB;
  const today = todayInContractZone();
  const counts = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'INVESTOR') AS investors_count,
         (SELECT COUNT(*) FROM investments WHERE status = 'ACTIVE') AS active_investments_count,
         (SELECT COALESCE(SUM(current_capital_cents), 0) FROM investments WHERE status = 'ACTIVE') AS total_capital_cents,
         (SELECT COUNT(*) FROM investments WHERE status = 'ACTIVE' AND maturity_date >= ? AND maturity_date <= ?) AS maturing_soon_count,
         (SELECT COUNT(*) FROM notification_events WHERE status = 'FAILED') AS notifications_failed_count`
    )
    .bind(today, addDays(today, 30))
    .first<Record<string, number>>();
  const ids = await db.prepare('SELECT id FROM investments').all<{ id: string }>();
  const balances = await balancesFor(db, ids.results.map((r) => r.id));
  let pending = 0;
  for (const b of balances.values()) pending += b.yield_pending_cents;
  return c.json({ success: true, data: { ...counts, yield_pending_cents: pending, as_of_date: today } });
});

// ======================================================================
// Inversionistas
// ======================================================================
adminRoutes.get('/investors', async (c) => {
  const { page, pageSize, offset } = pageParams(c, 20);
  const q = (c.req.query('q') ?? '').trim();
  const active = c.req.query('active') ?? '';
  const conds = ["u.role = 'INVESTOR'"];
  const binds: unknown[] = [];
  if (q) {
    conds.push("(lower(u.email) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.full_name, '')) LIKE ? ESCAPE '\\')");
    binds.push(likePattern(q), likePattern(q));
  }
  if (active === '1' || active === '0') {
    conds.push('u.is_active = ?');
    binds.push(Number(active));
  }
  const where = conds.join(' AND ');
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN investor_profiles p ON p.user_id = u.id WHERE ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(
      `SELECT u.id, u.email, u.is_active, u.created_at, p.id AS profile_id, p.full_name, p.rfc, p.phone, p.address,
              (SELECT COUNT(*) FROM investments i WHERE i.investor_user_id = u.id) AS investments_count
       FROM users u LEFT JOIN investor_profiles p ON p.user_id = u.id
       WHERE ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});

function parseBeneficiaries(body: Body) {
  const raw = body.beneficiaries;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 10) throw badRequest('INVALID_BENEFICIARIES', 'Beneficiarios debe ser una lista de hasta 10 personas.');
  const list = raw.map((b, i) => {
    if (!b || typeof b !== 'object') throw badRequest('INVALID_BENEFICIARIES', `Beneficiario ${i + 1} no válido.`);
    const o = b as Body;
    return {
      full_name: str(o, 'full_name', `Nombre del beneficiario ${i + 1}`, { min: 3, max: 150 }),
      relationship: oneOf(o, 'relationship', `Parentesco del beneficiario ${i + 1}`, RELATIONSHIPS),
      percentage_bps: int(o, 'percentage_bps', `Porcentaje del beneficiario ${i + 1}`, { min: 1, max: 10000 })
    };
  });
  const total = list.reduce((s, b) => s + b.percentage_bps, 0);
  if (list.length > 0 && total !== 10000) {
    throw badRequest('INVALID_BENEFICIARIES', 'Los porcentajes de los beneficiarios deben sumar 100 %.', { total_bps: total });
  }
  return list;
}

adminRoutes.post('/investors', async (c) => {
  const admin = c.get('user');
  const body = await readJson(c);
  const email = str(body, 'email', 'Correo', { max: 254 }).toLowerCase();
  if (!isEmail(email)) throw badRequest('INVALID_INPUT', 'Correo no válido.', { field: 'email' });
  const password = assertPassword(body.password);
  const fullName = str(body, 'full_name', 'Nombre completo', { min: 3, max: 150 });
  const rfc = optStr(body, 'rfc', 'RFC', 13)?.toUpperCase() ?? null;
  if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw badRequest('INVALID_INPUT', 'RFC con formato no válido.', { field: 'rfc' });
  const phone = optStr(body, 'phone', 'Teléfono', 30);
  const address = optStr(body, 'address', 'Domicilio', 300);
  const notes = optStr(body, 'notes', 'Notas', 1000);
  const beneficiaries = parseBeneficiaries(body);

  const db = c.env.DB;
  const userId = generateSecureToken('usr');
  const profileId = generateSecureToken('prof');
  await withDb(async () =>
    db.batch([
      db.prepare("INSERT INTO users (id, email, password_hash, role, is_active) VALUES (?, ?, ?, 'INVESTOR', 1)").bind(userId, email, await hashPassword(password)),
      db.prepare('INSERT INTO investor_profiles (id, user_id, full_name, rfc, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(profileId, userId, fullName, rfc, phone, address, notes),
      ...beneficiaries.map((b) =>
        db.prepare('INSERT INTO investor_beneficiaries (id, investor_user_id, full_name, relationship, percentage_bps, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(generateSecureToken('ben'), userId, b.full_name, b.relationship, b.percentage_bps, admin.id)
      ),
      auditStatement(db, {
        userId: admin.id,
        action: 'INVESTOR_CREATED',
        entityType: 'USER',
        entityId: userId,
        ipAddress: clientIp(c),
        newValues: { email, full_name: fullName, beneficiaries }
      })
    ])
  );
  return c.json({ success: true, data: { user_id: userId, profile_id: profileId, email, full_name: fullName } }, 201);
});

adminRoutes.get('/investors/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const user = await db.prepare("SELECT id, email, is_active, created_at FROM users WHERE id = ? AND role = 'INVESTOR'").bind(id).first<{ id: string; email: string; is_active: number; created_at: string }>();
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Inversionista no encontrado.');
  const profile = await db.prepare('SELECT id, full_name, rfc, phone, address FROM investor_profiles WHERE user_id = ?').bind(id).first();
  const beneficiaries = await db
    .prepare('SELECT id, full_name, relationship, percentage_bps FROM investor_beneficiaries WHERE investor_user_id = ? ORDER BY percentage_bps DESC, created_at')
    .bind(id)
    .all();
  const rows = await db.prepare(`SELECT ${INVESTMENT_COLUMNS} FROM investments i ${TERMS_JOIN} WHERE i.investor_user_id = ? ORDER BY i.start_date DESC`).bind(id).all<InvestmentRow>();
  const balances = await balancesFor(db, rows.results.map((r) => r.id));
  return c.json({
    success: true,
    data: {
      user: { ...user, is_active: user.is_active === 1 },
      profile: profile ?? null,
      beneficiaries: beneficiaries.results,
      investments: rows.results.map((r) => toListItem(r, balances.get(r.id)))
    }
  });
});

// ======================================================================
// Inversiones
// ======================================================================
adminRoutes.get('/investments', async (c) => {
  const { page, pageSize, offset } = pageParams(c, 20);
  const q = (c.req.query('q') ?? '').trim();
  const status = c.req.query('status') ?? '';
  const conds: string[] = ['1 = 1'];
  const binds: unknown[] = [];
  if (q) {
    conds.push("(lower(i.code) LIKE ? ESCAPE '\\' OR lower(COALESCE(p.full_name, '')) LIKE ? ESCAPE '\\' OR lower(u.email) LIKE ? ESCAPE '\\')");
    binds.push(likePattern(q), likePattern(q), likePattern(q));
  }
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) throw badRequest('INVALID_INPUT', 'Estado no válido.');
    conds.push('i.status = ?');
    binds.push(status);
  }
  const from = `FROM investments i JOIN users u ON u.id = i.investor_user_id LEFT JOIN investor_profiles p ON p.user_id = u.id ${TERMS_JOIN}`;
  const where = conds.join(' AND ');
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(
      `SELECT i.id, i.investor_user_id, i.code, i.investment_type, i.status, i.currency, i.start_date, i.maturity_date,
              i.initial_capital_cents, i.current_capital_cents, p.full_name AS investor_name, u.email AS investor_email,
              t.fixed_annual_rate_bps, t.payout_frequency, t.day_count_convention, t.capitalization_policy
       ${from} WHERE ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});

adminRoutes.post('/investments', async (c) => {
  const admin = c.get('user');
  const body = await readJson(c);
  const investorId = str(body, 'investor_user_id', 'Inversionista', { max: 100 });
  const code = str(body, 'code', 'Código de contrato', { min: 3, max: 30 }).toUpperCase();
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) throw badRequest('INVALID_INPUT', 'El código solo admite letras, números y guiones.', { field: 'code' });
  const investmentType = oneOf(body, 'investment_type', 'Tipo de inversión', INVESTMENT_TYPES);
  const start = date(body, 'start_date', 'Fecha de inicio');
  const maturity = date(body, 'maturity_date', 'Fecha de vencimiento');
  if (maturity <= start) throw badRequest('INVALID_INPUT', 'El vencimiento debe ser posterior al inicio.', { field: 'maturity_date' });
  const capital = int(body, 'capital_cents', 'Capital (centavos)', { min: 1, max: MAX_CAPITAL_CENTS });
  const rate = int(body, 'fixed_annual_rate_bps', 'Tasa anual (puntos básicos)', { min: 1, max: 10000 });
  const payout = oneOf(body, 'payout_frequency', 'Modalidad de cobro', PAYOUTS);
  const convention = oneOf(body, 'day_count_convention', 'Convención de días', CONVENTIONS);
  const capPolicy = oneOf(body, 'capitalization_policy', 'Destino del rendimiento', CAP_POLICIES);
  const notes = optStr(body, 'notes', 'Notas', 1000);

  const db = c.env.DB;
  const investor = await db.prepare("SELECT id, is_active FROM users WHERE id = ? AND role = 'INVESTOR'").bind(investorId).first<{ id: string; is_active: number }>();
  if (!investor) throw badRequest('INVALID_INPUT', 'El inversionista no existe.', { field: 'investor_user_id' });
  if (investor.is_active !== 1) throw badRequest('INVESTOR_INACTIVE', 'La cuenta del inversionista está deshabilitada.');

  const invId = generateSecureToken('inv');
  await withDb(() =>
    db.batch([
      db.prepare(
        `INSERT INTO investments (id, investor_user_id, code, investment_type, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents, notes)
         VALUES (?, ?, ?, ?, 'ACTIVE', 'MXN', ?, ?, ?, ?, ?)`
      ).bind(invId, investorId, code, investmentType, start, maturity, capital, capital, notes),
      db.prepare(
        `INSERT INTO investment_terms (id, investment_id, fixed_annual_rate_bps, payout_frequency, day_count_convention, capitalization_policy, effective_from)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(generateSecureToken('trm'), invId, rate, payout, convention, capPolicy, start),
      db.prepare(
        `INSERT INTO capital_movements (id, investment_id, movement_type, amount_cents, effective_date, notes, recorded_by_user_id)
         VALUES (?, ?, 'INITIAL_DEPOSIT', ?, ?, 'Capital inicial según contrato', ?)`
      ).bind(generateSecureToken('mov'), invId, capital, start, admin.id),
      auditStatement(db, {
        userId: admin.id,
        action: 'INVESTMENT_CREATED',
        entityType: 'INVESTMENT',
        entityId: invId,
        ipAddress: clientIp(c),
        newValues: { code, investment_type: investmentType, investor_user_id: investorId, capital_cents: capital, rate_bps: rate, payout_frequency: payout, day_count_convention: convention, capitalization_policy: capPolicy, start_date: start, maturity_date: maturity }
      })
    ])
  );
  return c.json({ success: true, data: { investment_id: invId, code, current_capital_cents: capital } }, 201);
});

adminRoutes.get('/investments/:id', async (c) => {
  const row = await c.env.DB
    .prepare(`SELECT ${INVESTMENT_COLUMNS}, p.full_name AS investor_name FROM investments i ${TERMS_JOIN} LEFT JOIN investor_profiles p ON p.user_id = i.investor_user_id WHERE i.id = ?`)
    .bind(c.req.param('id'))
    .first<InvestmentRow>();
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Inversión no encontrada.');
  const b = (await balancesFor(c.env.DB, [row.id])).get(row.id)!;
  return c.json({ success: true, data: toDetail(row, b, { investor_name: (row.investor_name as string | null) ?? null }) });
});

adminRoutes.get('/investments/:id/yields', async (c) => {
  const id = c.req.param('id');
  const exists = await c.env.DB.prepare('SELECT id FROM investments WHERE id = ?').bind(id).first();
  if (!exists) throw new AppError(404, 'NOT_FOUND', 'Inversión no encontrada.');
  return c.json({ success: true, data: await yieldEntriesWithSettlement(c.env.DB, id, c.req.query('pending') === '1') });
});

// ======================================================================
// Motor financiero
// ======================================================================
adminRoutes.post('/yields/preview', async (c) => {
  const body = await readJson(c);
  const id = str(body, 'investment_id', 'Inversión');
  return c.json({ success: true, data: await previewYield(c.env, id, date(body, 'period_start', 'Inicio del periodo'), date(body, 'period_end', 'Fin del periodo')) });
});

adminRoutes.post('/yields/confirm', async (c) => {
  const body = await readJson(c);
  const expected = body.amount_cents === undefined || body.amount_cents === null ? null : int(body, 'amount_cents', 'Importe esperado');
  const res = await confirmYield(c.env, {
    investmentId: str(body, 'investment_id', 'Inversión'),
    start: date(body, 'period_start', 'Inicio del periodo'),
    end: date(body, 'period_end', 'Fin del periodo'),
    expectedAmountCents: expected,
    note: optStr(body, 'note', 'Nota'),
    adminId: c.get('user').id,
    ip: clientIp(c)
  });
  return c.json({ success: true, data: { yield_entry_id: res.id, is_existing: res.isExisting, amount_cents: res.amountCents } }, res.isExisting ? 200 : 201);
});

adminRoutes.post('/yields/manual', async (c) => {
  const body = await readJson(c);
  const res = await recordManualYield(c.env, {
    investmentId: str(body, 'investment_id', 'Inversión'),
    start: date(body, 'period_start', 'Inicio del periodo'),
    end: date(body, 'period_end', 'Fin del periodo'),
    amountCents: int(body, 'amount_cents', 'Importe (centavos)', { min: -MAX_CAPITAL_CENTS, max: MAX_CAPITAL_CENTS }),
    reason: str(body, 'reason', 'Motivo', { min: 5, max: 500 }),
    adminId: c.get('user').id,
    ip: clientIp(c)
  });
  return c.json({ success: true, data: { yield_entry_id: res.id } }, 201);
});

adminRoutes.post('/yields/:id/reverse', async (c) => {
  const body = await readJson(c);
  const res = await reverseYieldEntry(c.env, c.req.param('id'), str(body, 'reason', 'Motivo', { min: 5, max: 500 }), c.get('user').id, clientIp(c));
  return c.json({ success: true, data: { reversal_entry_id: res.reversalId } }, 201);
});

// ======================================================================
// Pagos externos y reinversión
// ======================================================================
adminRoutes.get('/payments', async (c) => {
  const { page, pageSize, offset } = pageParams(c, 20);
  const investmentId = c.req.query('investment_id') ?? '';
  const where = investmentId ? 'WHERE pr.investment_id = ?' : '';
  const binds = investmentId ? [investmentId] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM payment_records pr ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(
      `SELECT pr.id, pr.investment_id, i.code AS investment_code, p.full_name AS investor_name, pr.amount_cents,
              COALESCE((SELECT SUM(amount_cents) FROM payment_allocations a WHERE a.payment_record_id = pr.id), 0) AS allocated_cents,
              pr.paid_at, pr.status, pr.reference, pr.notes
       FROM payment_records pr JOIN investments i ON i.id = pr.investment_id
       LEFT JOIN investor_profiles p ON p.user_id = i.investor_user_id
       ${where} ORDER BY pr.paid_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});

adminRoutes.post('/payments', async (c) => {
  const body = await readJson(c);
  if (!Array.isArray(body.allocations)) throw badRequest('INVALID_INPUT', 'allocations debe ser una lista (puede estar vacía).');
  if (body.allocations.length > 100) throw badRequest('INVALID_INPUT', 'Demasiadas asignaciones en un solo pago.');
  const allocations = (body.allocations as unknown[]).map((a, i) => {
    if (!a || typeof a !== 'object') throw badRequest('INVALID_INPUT', `Asignación ${i + 1} no válida.`);
    const o = a as Body;
    return { yieldEntryId: str(o, 'yield_entry_id', `Partida de la asignación ${i + 1}`), amountCents: int(o, 'amount_cents', `Importe de la asignación ${i + 1}`, { min: 1, max: MAX_CAPITAL_CENTS }) };
  });
  const res = await recordExternalPayment(c.env, {
    investmentId: str(body, 'investment_id', 'Inversión'),
    amountCents: int(body, 'amount_cents', 'Monto del pago (centavos)', { min: 1, max: MAX_CAPITAL_CENTS }),
    paidAt: dateTime(body, 'paid_at', 'Fecha de pago'),
    reference: str(body, 'reference', 'Referencia bancaria', { min: 3, max: 100 }),
    notes: optStr(body, 'notes', 'Notas', 1000),
    allocations,
    adminId: c.get('user').id,
    ip: clientIp(c)
  });
  return c.json({ success: true, data: { payment_id: res.paymentId } }, 201);
});

adminRoutes.post('/investments/:id/reinvest', async (c) => {
  const body = await readJson(c);
  const res = await executeReinvestment(c.env, {
    investmentId: c.req.param('id'),
    yieldEntryId: str(body, 'yield_entry_id', 'Partida'),
    effectiveDate: date(body, 'effective_date', 'Fecha efectiva'),
    notes: optStr(body, 'notes', 'Notas', 500),
    adminId: c.get('user').id,
    ip: clientIp(c)
  });
  return c.json({ success: true, data: { reinvestment_id: res.reinvestmentId, capital_movement_id: res.capitalMovementId, new_capital_cents: res.newCapitalCents } }, 201);
});

// ======================================================================
// Documentos (exclusivos de administración)
// ======================================================================
adminRoutes.get('/documents', async (c) => {
  const { page, pageSize, offset } = pageParams(c, 20);
  const investmentId = c.req.query('investment_id') ?? '';
  const where = `d.is_archived = 0${investmentId ? ' AND d.investment_id = ?' : ''}`;
  const binds = investmentId ? [investmentId] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM investment_documents d WHERE ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(
      `SELECT d.id, d.investment_id, i.code AS investment_code, d.title, d.document_type, d.original_filename, d.size_bytes, d.content_type, d.created_at
       FROM investment_documents d JOIN investments i ON i.id = d.investment_id
       WHERE ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});

adminRoutes.post('/investments/:id/documents', async (c) => {
  const form = await c.req.formData().catch(() => null);
  if (!form) throw badRequest('INVALID_INPUT', 'Se espera multipart/form-data.');
  const file = form.get('file') as unknown as File | string | null;
  const title = form.get('title');
  const type = form.get('document_type');
  if (!file || typeof file === 'string') throw badRequest('INVALID_INPUT', 'El archivo (file) es obligatorio.');
  if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 200) throw badRequest('INVALID_INPUT', 'El título debe tener entre 3 y 200 caracteres.');
  if (typeof type !== 'string' || !(DOCUMENT_TYPES as readonly string[]).includes(type)) throw badRequest('INVALID_INPUT', `Tipo de documento no válido (${DOCUMENT_TYPES.join(', ')}).`);
  const res = await uploadPrivateDocument(c.env.DB, c.env.DOCS_BUCKET, {
    investmentId: c.req.param('id'),
    title: title.trim(),
    documentType: type as (typeof DOCUMENT_TYPES)[number],
    originalFilename: file.name || 'documento',
    fileBuffer: await file.arrayBuffer(),
    uploadedByUserId: c.get('user').id,
    ip: clientIp(c)
  });
  return c.json({ success: true, data: res }, 201);
});

adminRoutes.get('/documents/:id/download', async (c) => {
  const doc = await getDocumentForAdmin(c.env.DB, c.env.DOCS_BUCKET, c.req.param('id'));
  const ascii = doc.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return new Response(doc.body, {
    status: 200,
    headers: {
      'Content-Type': doc.contentType,
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'Content-Length': String(doc.sizeBytes),
      'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      'X-Content-Type-Options': 'nosniff'
    }
  });
});

adminRoutes.delete('/documents/:id', async (c) => {
  await archiveDocument(c.env.DB, c.req.param('id'), c.get('user').id, clientIp(c));
  return c.json({ success: true, data: { message: 'Documento archivado.' } });
});

// ======================================================================
// Avisos, bitácora y trabajos
// ======================================================================
adminRoutes.get('/notifications', async (c) => {
  const { page, pageSize, offset } = pageParams(c, 20);
  const status = c.req.query('status') ?? '';
  if (status && !['PENDING', 'SENT', 'FAILED'].includes(status)) throw badRequest('INVALID_INPUT', 'Estado no válido.');
  const where = status ? 'WHERE status = ?' : '';
  const binds = status ? [status] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM notification_events ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(
      `SELECT id, user_id, investment_id, event_type, recipient_email, subject, status, attempts_count, error_message, created_at
       FROM notification_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});

adminRoutes.get('/audit-logs', async (c) => {
  const { page, pageSize, offset } = pageParams(c, 20, 100);
  const action = (c.req.query('action') ?? '').trim();
  const where = action ? "WHERE lower(a.action) LIKE ? ESCAPE '\\'" : '';
  const binds = action ? [likePattern(action)] : [];
  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs a ${where}`).bind(...binds).first<{ n: number }>();
  const rows = await c.env.DB
    .prepare(
      `SELECT a.id, a.user_id, a.action, a.entity_type, a.entity_id, a.old_values_json, a.new_values_json, a.ip_address, a.created_at,
              u.email AS actor_email
       FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id
       ${where} ORDER BY a.created_at DESC, a.rowid DESC LIMIT ? OFFSET ?`
    )
    .bind(...binds, pageSize, offset)
    .all();
  return c.json({ success: true, data: rows.results, pagination: pagination(page, pageSize, total?.n ?? 0) });
});

const runJobs = async (c: { env: Env; json: (d: unknown) => Response }) => c.json({ success: true, data: await runScheduledMaintenance(c.env) });
adminRoutes.post('/jobs/run-maintenance', (c) => runJobs(c));
adminRoutes.post('/jobs/run-preview', (c) => runJobs(c));
