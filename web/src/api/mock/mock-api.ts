// ⚠️ Servidor SIMULADO con datos FICTICIOS. Imita el contrato de API, incluidos 401/403/409.
// La sesión simulada vive solo en memoria (se pierde al recargar), igual que no se persisten tokens.

import { ApiError, notifyUnauthorized } from '../client';
import type { PortalApi } from '../portal-api';
import type {
  AdminInvestmentRow,
  AdminYieldEntry,
  CurrencyTotals,
  HistoryEntry,
  InvestmentDetail,
  InvestmentListItem,
  NotificationEvent,
  PageQuery,
  Paginated,
  Session
} from '../types';
import {
  createMockDb,
  daysBetween,
  fictitiousPdf,
  MOCK_MFA_CODE,
  mockRateAt,
  mockYieldAmount,
  nextId,
  type MockDb,
  type MockInvestment,
  type MockUser
} from './db';

const latency = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 300);
const delay = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

let db: MockDb = /* @__PURE__ */ createMockDb();
// Solo modo mock: VITE_MOCK_AUTOLOGIN=usr_fict_01 inicia con esa sesión (útil para revisar pantallas).
let sessionUserId: string | null = import.meta.env.VITE_MOCK_AUTOLOGIN || null;

/** Solo para pruebas: reinicia los datos ficticios y la sesión simulada. */
export function resetMockState(opts: { loginAs?: string } = {}) {
  db = createMockDb();
  sessionUserId = opts.loginAs ?? null;
}

const fail = (status: number, code: string, message: string): never => {
  const err = new ApiError(status, code, message);
  if (status === 401) notifyUnauthorized(err);
  throw err;
};

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function currentUser(): MockUser {
  const u = db.users.find((x) => x.id === sessionUserId);
  if (!u) return fail(401, 'UNAUTHORIZED', 'Su sesión expiró. Inicie sesión de nuevo.');
  return u;
}
function requireInvestorAccess(): MockUser {
  return currentUser();
}
function requireAdmin(): MockUser {
  const u = currentUser();
  if (u.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Acceso no autorizado para este rol.');
  return u;
}
function ownedInvestment(id: string): MockInvestment {
  const u = currentUser();
  const inv = db.investments.find((i) => i.id === id);
  if (!inv) return fail(404, 'NOT_FOUND', 'Inversión no encontrada.');
  if (u.role === 'INVESTOR' && inv.investor_user_id !== u.id) fail(403, 'FORBIDDEN', 'Acceso no autorizado a esta inversión.');
  return inv;
}

function paginate<T>(rows: T[], q: PageQuery = {}): Paginated<T> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, q.pageSize ?? 10));
  const total = rows.length;
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
  };
}

function toSession(u: MockUser): Session {
  return {
    user: { id: u.id, email: u.email, role: u.role, is_active: u.is_active, mfa_enabled: u.mfa_enabled },
    investor_profile: u.profile ? { ...u.profile } : null
  };
}

// ----- saldos del servidor simulado -----
function yieldBalances(yieldId: string) {
  const paid = db.payments
    .filter((p) => p.status === 'CONFIRMED')
    .flatMap((p) => p.allocations)
    .filter((a) => a.yield_entry_id === yieldId)
    .reduce((s, a) => s + a.amount_cents, 0);
  const reinvested = db.movements
    .filter((m) => m.movement_type === 'REINVESTMENT_CREDIT' && m.yield_entry_id === yieldId)
    .reduce((s, m) => s + m.amount_cents, 0);
  return { paid, reinvested };
}

function balance(inv: MockInvestment) {
  const ys = db.yields.filter((y) => y.investment_id === inv.id && y.status === 'CONFIRMED');
  let confirmed = 0, paid = 0, reinvested = 0;
  for (const y of ys) {
    const b = yieldBalances(y.id);
    confirmed += y.amount_cents;
    paid += b.paid;
    reinvested += b.reinvested;
  }
  return {
    capital_cents: inv.current_capital_cents,
    yield_generated_cents: confirmed,
    yield_confirmed_cents: confirmed,
    yield_paid_cents: paid,
    yield_reinvested_cents: reinvested,
    yield_pending_cents: Math.max(0, confirmed - paid - reinvested)
  };
}

const terms = (inv: MockInvestment) => ({
  rate_type: inv.rate_type,
  fixed_annual_rate_bps: inv.rate_bps,
  reference_rate_code: inv.reference_rate_code,
  spread_bps: inv.spread_bps,
  payout_frequency: inv.payout_frequency,
  day_count_convention: inv.day_count_convention,
  capitalization_policy: inv.capitalization_policy
});

function listItem(inv: MockInvestment): InvestmentListItem {
  const b = balance(inv);
  return {
    id: inv.id, code: inv.code, investment_type: inv.investment_type, status: inv.status, currency: inv.currency, start_date: inv.start_date,
    maturity_date: inv.maturity_date, current_capital_cents: inv.current_capital_cents, terms: terms(inv),
    stats: {
      yield_confirmed_cents: b.yield_confirmed_cents,
      yield_paid_cents: b.yield_paid_cents,
      yield_reinvested_cents: b.yield_reinvested_cents,
      yield_pending_cents: b.yield_pending_cents
    }
  };
}

function detail(inv: MockInvestment): InvestmentDetail {
  return {
    id: inv.id, code: inv.code, investment_type: inv.investment_type, status: inv.status, currency: inv.currency, start_date: inv.start_date,
    maturity_date: inv.maturity_date, initial_capital_cents: inv.initial_capital_cents,
    current_capital_cents: inv.current_capital_cents, terms: terms(inv), balance: balance(inv),
    current_reference_rate: currentRate(inv)
  };
}

function refIdFor(investmentId: string, start: string) {
  const inv = db.investments.find((i) => i.id === investmentId);
  if (!inv || inv.rate_type !== 'REFERENCE' || !inv.reference_rate_code) return undefined;
  return mockRateAt(db, inv.reference_rate_code, start)?.id;
}

function currentRate(inv: MockInvestment) {
  if (inv.rate_type !== 'REFERENCE' || !inv.reference_rate_code) return null;
  const r = mockRateAt(db, inv.reference_rate_code, today());
  return r ? { rate_code: r.rate_code, annual_rate_bps: r.annual_rate_bps, effective_date: r.effective_date, applied_rate_bps: r.annual_rate_bps + (inv.spread_bps ?? 0) } : null;
}

/** Totales por moneda (el servidor simulado nunca mezcla pesos con dólares). */
function totalsByCurrency(invs: MockInvestment[]) {
  const acc = new Map<string, CurrencyTotals>();
  for (const inv of invs) {
    const b = balance(inv);
    const t = acc.get(inv.currency) ?? {
      currency: inv.currency, total_capital_cents: 0, total_yield_generated_cents: 0, total_yield_confirmed_cents: 0,
      total_yield_paid_cents: 0, total_yield_reinvested_cents: 0, total_yield_pending_cents: 0, active_investments_count: 0
    };
    if (inv.status === 'ACTIVE') {
      t.total_capital_cents += b.capital_cents;
      t.active_investments_count += 1;
    }
    t.total_yield_generated_cents += b.yield_generated_cents;
    t.total_yield_confirmed_cents += b.yield_confirmed_cents;
    t.total_yield_paid_cents += b.yield_paid_cents;
    t.total_yield_reinvested_cents += b.yield_reinvested_cents;
    t.total_yield_pending_cents += b.yield_pending_cents;
    acc.set(inv.currency, t);
  }
  return [...acc.values()].sort((a, b) => (a.currency === 'MXN' ? -1 : b.currency === 'MXN' ? 1 : 0));
}

function adminYield(y: MockDb['yields'][number]): AdminYieldEntry {
  const b = yieldBalances(y.id);
  return {
    id: y.id, investment_id: y.investment_id, period_start: y.period_start, period_end: y.period_end,
    amount_cents: y.amount_cents, status: y.status, source: y.source,
    paid_cents: b.paid, reinvested_cents: b.reinvested,
    pending_cents: y.status === 'CONFIRMED' ? Math.max(0, y.amount_cents - b.paid - b.reinvested) : 0,
    note: y.note, created_at: y.created_at
  };
}

function audit(action: string, entity: string, entityId: string, values: Record<string, unknown>) {
  const u = db.users.find((x) => x.id === sessionUserId);
  db.audit.push({
    id: nextId(db, 'aud'), user_id: u?.id ?? null, actor_email: u?.email ?? null, action, entity_type: entity,
    entity_id: entityId, old_values_json: null, new_values_json: JSON.stringify(values), ip_address: '203.0.113.10',
    created_at: nowIso()
  });
}

function notify(userId: string, type: string, subject: string) {
  const u = db.users.find((x) => x.id === userId);
  if (!u) return;
  db.notifications.push({
    id: nextId(db, 'not'), user_id: userId, recipient_email: u.email, event_type: type, subject,
    status: 'PENDING', created_at: nowIso(), attempts_count: 0, error_message: null
  });
}

const investorName = (userId: string) => db.users.find((u) => u.id === userId)?.profile?.full_name ?? null;
const byDesc = <T,>(key: (t: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));

function wrap<T extends object>(obj: T): T {
  // Envuelve cada método con latencia simulada.
  const out: Record<string, unknown> = {};
  for (const [k, fn] of Object.entries(obj)) {
    out[k] = async (...args: unknown[]) => {
      await delay();
      return (fn as (...a: unknown[]) => unknown)(...args);
    };
  }
  return out as T;
}

export const mockApi: PortalApi = {
  auth: /* @__PURE__ */ wrap<PortalApi['auth']>({
    async login({ email, password, mfa_token }) {
      const u = db.users.find((x) => x.email === email.trim().toLowerCase());
      if (!u || u.password !== password) return fail(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
      if (!u.is_active) return fail(403, 'ACCOUNT_INACTIVE', 'Cuenta deshabilitada por el administrador.');
      if (u.role === 'ADMIN' && u.mfa_enabled) {
        if (!mfa_token) return fail(401, 'MFA_REQUIRED', 'Se requiere el código de verificación de 6 dígitos.');
        if (mfa_token.trim() !== MOCK_MFA_CODE) return fail(401, 'MFA_INVALID', 'Código de verificación incorrecto o expirado.');
      }
      sessionUserId = u.id;
      return toSession(u);
    },
    async logout() {
      sessionUserId = null;
    },
    async me() {
      return toSession(currentUser());
    },
    async changePassword(current, next) {
      const u = currentUser();
      if (u.password !== current) return fail(400, 'INVALID_CREDENTIALS', 'La contraseña actual no es correcta.');
      if (next.length < 8) return fail(400, 'WEAK_PASSWORD', 'La nueva contraseña debe tener al menos 8 caracteres.');
      u.password = next;
      notify(u.id, 'PASSWORD_CHANGED', 'Aviso de seguridad: su contraseña ha sido modificada');
    },
    async requestPasswordReset() {
      // Respuesta constante (sin enumeración de usuarios)
    },
    async resetPassword(token, next) {
      if (token !== 'rst_ficticio') return fail(400, 'INVALID_OR_EXPIRED_TOKEN', 'El enlace de recuperación no es válido o ya expiró.');
      if (next.length < 8) return fail(400, 'WEAK_PASSWORD', 'La contraseña debe tener al menos 8 caracteres.');
    },
    async mfaSetup() {
      requireAdmin();
      return { secret: 'FICTICIOFICTICIOFICT', otpauth_url: 'otpauth://totp/Portal:admin@ficticio.test?secret=FICTICIOFICTICIOFICT' };
    },
    async mfaVerify(token) {
      const u = requireAdmin();
      if (token !== MOCK_MFA_CODE) return fail(400, 'MFA_INVALID', 'Código incorrecto.');
      u.mfa_enabled = true;
    }
  }),

  investor: /* @__PURE__ */ wrap<PortalApi['investor']>({
    async summary() {
      const u = requireInvestorAccess();
      const invs = db.investments.filter((i) => i.investor_user_id === u.id);
      return {
        by_currency: totalsByCurrency(invs),
        active_investments_count: invs.filter((i) => i.status === 'ACTIVE').length,
        as_of_date: today()
      };
    },
    async investments(q) {
      const u = requireInvestorAccess();
      const rows = db.investments
        .filter((i) => i.investor_user_id === u.id && (!q.status || i.status === q.status))
        .sort(byDesc((i) => i.start_date))
        .map(listItem);
      return paginate(rows, q);
    },
    async investment(id) {
      return detail(ownedInvestment(id));
    },
    async history(id, q) {
      const inv = ownedInvestment(id);
      const type = q.type ?? 'ALL';
      const rows: HistoryEntry[] = [];
      if (type === 'ALL' || type === 'YIELDS') {
        for (const y of db.yields.filter((x) => x.investment_id === inv.id && x.status === 'CONFIRMED')) {
          const b = yieldBalances(y.id);
          rows.push({
            entry_type: 'YIELD', id: y.id, effective_date: y.period_end, period_start: y.period_start,
            period_end: y.period_end, amount_cents: y.amount_cents, status: y.status, source: y.source,
            paid_amount_cents: b.paid, pending_amount_cents: Math.max(0, y.amount_cents - b.paid - b.reinvested),
            note: b.reinvested > 0 ? 'Reinvertido a capital según contrato' : y.note
          });
        }
      }
      if (type === 'ALL' || type === 'PAYMENTS') {
        for (const p of db.payments.filter((x) => x.investment_id === inv.id && x.status === 'CONFIRMED')) {
          rows.push({
            entry_type: 'PAYMENT', id: p.id, effective_date: p.paid_at.slice(0, 10), amount_cents: p.amount_cents,
            status: p.status, reference: p.reference, note: 'Transferencia externa confirmada por la administración'
          });
        }
      }
      if (type === 'ALL' || type === 'CAPITAL') {
        for (const m of db.movements.filter((x) => x.investment_id === inv.id)) {
          rows.push({
            entry_type: 'CAPITAL', id: m.id, effective_date: m.effective_date, amount_cents: m.amount_cents,
            status: 'CONFIRMED',
            note: m.movement_type === 'INITIAL_DEPOSIT' ? 'Capital inicial' : m.movement_type === 'REINVESTMENT_CREDIT' ? 'Reinversión de rendimiento' : 'Aportación de capital'
          });
        }
      }
      rows.sort(byDesc((r) => r.effective_date));
      return paginate(rows, { page: q.page, pageSize: q.pageSize ?? 10 });
    },
    async series(id) {
      const inv = ownedInvestment(id);
      const points: Array<{ date: string; capital_cents: number }> = [];
      let capital = 0;
      for (const m of [...db.movements.filter((x) => x.investment_id === inv.id)].sort((a, b) => a.effective_date.localeCompare(b.effective_date))) {
        capital += m.amount_cents;
        points.push({ date: m.effective_date, capital_cents: capital });
      }
      const end = inv.status === 'ACTIVE' ? (today() < inv.maturity_date ? today() : inv.maturity_date) : inv.maturity_date;
      points.push({ date: end, capital_cents: capital });
      const periods = db.yields
        .filter((y) => y.investment_id === inv.id && y.status === 'CONFIRMED')
        .sort((a, b) => a.period_end.localeCompare(b.period_end))
        .map((y) => {
          const b = yieldBalances(y.id);
          return {
            period_start: y.period_start, period_end: y.period_end, confirmed_cents: y.amount_cents,
            paid_cents: b.paid, reinvested_cents: b.reinvested,
            pending_cents: Math.max(0, y.amount_cents - b.paid - b.reinvested)
          };
        });
      return { as_of_date: today(), capital_points: points, yield_periods: periods };
    },
    async notifications(q) {
      const u = requireInvestorAccess();
      const rows: NotificationEvent[] = db.notifications
        .filter((n) => n.user_id === u.id && n.event_type !== 'DOCUMENT_UPLOADED')
        .sort(byDesc((n) => n.created_at))
        .map(({ id, event_type, subject, status, created_at }) => ({ id, event_type, subject, status, created_at }));
      return paginate(rows, q);
    },
  }),

  admin: /* @__PURE__ */ wrap<PortalApi['admin']>({
    async summary() {
      requireAdmin();
      const active = db.investments.filter((i) => i.status === 'ACTIVE');
      const in30 = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      return {
        investors_count: db.users.filter((u) => u.role === 'INVESTOR').length,
        active_investments_count: active.length,
        by_currency: totalsByCurrency(db.investments).map((t) => ({
          currency: t.currency, total_capital_cents: t.total_capital_cents, yield_pending_cents: t.total_yield_pending_cents, active_investments_count: t.active_investments_count
        })),
        reference_rates: (['CETES_28', 'CETES_91', 'CETES_182', 'CETES_364'] as const)
          .map((code) => mockRateAt(db, code, today()))
          .filter((r): r is NonNullable<typeof r> => !!r)
          .map((r) => ({ rate_code: r.rate_code, annual_rate_bps: r.annual_rate_bps, effective_date: r.effective_date })),
        maturing_soon_count: active.filter((i) => i.maturity_date >= today() && i.maturity_date <= in30).length,
        notifications_failed_count: db.notifications.filter((n) => n.status === 'FAILED').length,
        as_of_date: today()
      };
    },
    async investors(q) {
      requireAdmin();
      const term = (q.q ?? '').trim().toLowerCase();
      const rows = db.users
        .filter((u) => u.role === 'INVESTOR')
        .filter((u) => !term || u.email.includes(term) || (u.profile?.full_name ?? '').toLowerCase().includes(term))
        .filter((u) => !q.active || (q.active === '1') === u.is_active)
        .sort(byDesc((u) => u.created_at))
        .map((u) => ({
          id: u.id, email: u.email, is_active: u.is_active, created_at: u.created_at,
          profile_id: u.profile?.id ?? null, full_name: u.profile?.full_name ?? null, rfc: u.profile?.rfc ?? null,
          phone: u.profile?.phone ?? null, address: u.profile?.address ?? null,
          investments_count: db.investments.filter((i) => i.investor_user_id === u.id).length
        }));
      return paginate(rows, q);
    },
    async investor(id) {
      requireAdmin();
      const u = db.users.find((x) => x.id === id && x.role === 'INVESTOR');
      if (!u) return fail(404, 'NOT_FOUND', 'Inversionista no encontrado.');
      return {
        user: { id: u.id, email: u.email, is_active: u.is_active, created_at: u.created_at },
        profile: u.profile ? { ...u.profile } : null,
        beneficiaries: u.beneficiaries.map((b) => ({ ...b })),
        investments: db.investments.filter((i) => i.investor_user_id === u.id).map(listItem)
      };
    },
    async createInvestor(input) {
      requireAdmin();
      const email = input.email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) return fail(409, 'EMAIL_ALREADY_EXISTS', 'El correo electrónico ya está registrado.');
      const bens = input.beneficiaries ?? [];
      if (bens.length > 0 && bens.reduce((s, b) => s + b.percentage_bps, 0) !== 10_000) {
        return fail(400, 'INVALID_BENEFICIARIES', 'Los porcentajes de los beneficiarios deben sumar 100 %.');
      }
      const id = nextId(db, 'usr');
      db.users.push({
        id, email, role: 'INVESTOR', is_active: true, mfa_enabled: false, password: input.password, created_at: nowIso(),
        beneficiaries: bens.map((b) => ({ ...b, id: nextId(db, 'ben') })),
        profile: { id: nextId(db, 'prof'), full_name: input.full_name, rfc: input.rfc || null, phone: input.phone || null, address: input.address || null }
      });
      audit('INVESTOR_CREATED', 'USER', id, { email, full_name: input.full_name, beneficiaries_count: bens.length });
      return { user_id: id };
    },
    async investments(q) {
      requireAdmin();
      const term = (q.q ?? '').trim().toLowerCase();
      const rows: AdminInvestmentRow[] = db.investments
        .filter((i) => !q.status || i.status === q.status)
        .filter((i) => !term || i.code.toLowerCase().includes(term) || (investorName(i.investor_user_id) ?? '').toLowerCase().includes(term))
        .sort(byDesc((i) => i.created_at))
        .map((i) => ({
          id: i.id, investor_user_id: i.investor_user_id, code: i.code, investment_type: i.investment_type, status: i.status, currency: i.currency,
          start_date: i.start_date, maturity_date: i.maturity_date, initial_capital_cents: i.initial_capital_cents,
          current_capital_cents: i.current_capital_cents, investor_name: investorName(i.investor_user_id),
          investor_email: db.users.find((u) => u.id === i.investor_user_id)?.email ?? '',
          rate_type: i.rate_type, fixed_annual_rate_bps: i.rate_bps, reference_rate_code: i.reference_rate_code, spread_bps: i.spread_bps,
          payout_frequency: i.payout_frequency,
          day_count_convention: i.day_count_convention, capitalization_policy: i.capitalization_policy
        }));
      return paginate(rows, q);
    },
    async investment(id) {
      requireAdmin();
      const inv = db.investments.find((i) => i.id === id);
      if (!inv) return fail(404, 'NOT_FOUND', 'Inversión no encontrada.');
      return { ...detail(inv), investor_user_id: inv.investor_user_id, investor_name: investorName(inv.investor_user_id), notes: inv.notes };
    },
    async createInvestment(input) {
      requireAdmin();
      if (db.investments.some((i) => i.code === input.code.trim())) return fail(409, 'CODE_ALREADY_EXISTS', 'Ya existe una inversión con ese código.');
      if (input.investment_type === 'CETES' && input.currency !== 'MXN') return fail(400, 'INVALID_INPUT', 'Las inversiones a CETES solo pueden ser en pesos (MXN).');
      const isRef = input.investment_type === 'CETES';
      const id = nextId(db, 'inv');
      db.investments.push({
        id, investor_user_id: input.investor_user_id, code: input.code.trim(), investment_type: input.investment_type, currency: input.currency, status: 'ACTIVE',
        start_date: input.start_date, maturity_date: input.maturity_date, initial_capital_cents: input.capital_cents,
        current_capital_cents: input.capital_cents, rate_bps: isRef ? null : input.fixed_annual_rate_bps ?? null,
        rate_type: isRef ? 'REFERENCE' : 'FIXED', reference_rate_code: isRef ? input.reference_rate_code ?? 'CETES_28' : null, spread_bps: isRef ? input.spread_bps ?? 0 : null,
        payout_frequency: input.payout_frequency, day_count_convention: input.day_count_convention,
        capitalization_policy: input.capitalization_policy, notes: input.notes || null, created_at: nowIso()
      });
      db.movements.push({ id: nextId(db, 'mov'), investment_id: id, movement_type: 'INITIAL_DEPOSIT', amount_cents: input.capital_cents, effective_date: input.start_date });
      audit('INVESTMENT_CREATED', 'INVESTMENT', id, { code: input.code, investment_type: input.investment_type });
      return { investment_id: id };
    },
    async yields(investmentId, q) {
      requireAdmin();
      return db.yields
        .filter((y) => y.investment_id === investmentId)
        .map(adminYield)
        .filter((y) => !q?.pendingOnly || (y.status === 'CONFIRMED' && y.pending_cents > 0))
        .sort((a, b) => b.period_end.localeCompare(a.period_end));
    },
    async previewYield(input) {
      requireAdmin();
      const inv = db.investments.find((i) => i.id === input.investment_id);
      if (!inv) return fail(404, 'NOT_FOUND', 'Inversión no encontrada.');
      if (input.period_end <= input.period_start) return fail(400, 'INVALID_PERIOD', 'La fecha final debe ser posterior a la inicial.');
      const days = daysBetween(input.period_start, input.period_end);
      let rate = inv.rate_bps ?? 0;
      let ref: ReturnType<typeof mockRateAt> = undefined;
      if (inv.rate_type === 'REFERENCE') {
        ref = mockRateAt(db, inv.reference_rate_code!, input.period_start);
        if (!ref) return fail(409, 'REFERENCE_RATE_MISSING', `Registre la tasa CETES vigente al ${input.period_start} en Administración › Tasas de referencia.`);
        rate = ref.annual_rate_bps + (inv.spread_bps ?? 0);
      }
      const amount = mockYieldAmount(inv.current_capital_cents, rate, input.period_start, input.period_end);
      return {
        investment_id: inv.id, period_start: input.period_start, period_end: input.period_end, days_in_period: days,
        capital_cents: inv.current_capital_cents, annual_rate_bps: rate, calculated_yield_cents: amount,
        day_count_convention: inv.day_count_convention, currency: inv.currency, rate_type: inv.rate_type,
        reference_rate_code: inv.reference_rate_code, reference_rate_bps: ref?.annual_rate_bps ?? null,
        reference_rate_date: ref?.effective_date ?? null, spread_bps: inv.spread_bps, rules_approved: false,
        calculation_formula: ref
          ? `${inv.current_capital_cents} * ((${ref.annual_rate_bps} - ${Math.abs(inv.spread_bps ?? 0)}) / 10000) * (${days} / 365)`
          : `${inv.current_capital_cents} * (${rate} / 10000) * (${days} / 365)`
      };
    },
    async confirmYield(input) {
      requireAdmin();
      const existing = db.yields.find(
        (y) => y.investment_id === input.investment_id && y.period_start === input.period_start && y.period_end === input.period_end && y.status === 'CONFIRMED'
      );
      if (existing) return { yield_entry_id: existing.id, is_existing: true, amount_cents: existing.amount_cents };
      const id = nextId(db, 'yid');
      db.yields.push({
        id, investment_id: input.investment_id, period_start: input.period_start, period_end: input.period_end,
        amount_cents: input.amount_cents, status: 'CONFIRMED', source: 'AUTO', note: input.note ?? null, created_at: nowIso(),
        reference_rate_id: refIdFor(input.investment_id, input.period_start)
      });
      audit('YIELD_CONFIRMED', 'YIELD_ENTRY', id, { amount_cents: input.amount_cents });
      return { yield_entry_id: id, is_existing: false, amount_cents: input.amount_cents };
    },
    async manualYield(input) {
      requireAdmin();
      if (input.reason.trim().length < 5) return fail(400, 'INVALID_INPUT', 'El motivo debe tener al menos 5 caracteres.');
      const id = nextId(db, 'yid');
      db.yields.push({
        id, investment_id: input.investment_id, period_start: input.period_start, period_end: input.period_end,
        amount_cents: input.amount_cents, status: 'CONFIRMED', source: 'MANUAL', note: input.reason, created_at: nowIso()
      });
      audit('MANUAL_YIELD_RECORDED', 'YIELD_ENTRY', id, { amount_cents: input.amount_cents, reason: input.reason });
      return { yield_entry_id: id };
    },
    async reverseYield(yieldId, reason) {
      requireAdmin();
      const y = db.yields.find((x) => x.id === yieldId);
      if (!y) return fail(404, 'NOT_FOUND', 'Partida no encontrada.');
      if (y.status === 'REVERSED') return fail(400, 'REVERSAL_ERROR', 'Esta partida ya fue reversada.');
      const b = yieldBalances(y.id);
      if (b.paid > 0 || b.reinvested > 0) return fail(400, 'REVERSAL_ERROR', 'No se puede reversar un rendimiento con pagos o reinversión asignados.');
      y.status = 'REVERSED';
      const rid = nextId(db, 'yid');
      db.yields.push({ ...y, id: rid, amount_cents: -y.amount_cents, status: 'REVERSED', source: 'REVERSAL', note: reason, reversal_of: y.id, created_at: nowIso() });
      audit('YIELD_REVERSED', 'YIELD_ENTRY', y.id, { reason });
      return { reversal_entry_id: rid };
    },
    async payments(q) {
      requireAdmin();
      const rows = db.payments
        .filter((p) => !q.investment_id || p.investment_id === q.investment_id)
        .sort(byDesc((p) => p.paid_at))
        .map((p) => {
          const inv = db.investments.find((i) => i.id === p.investment_id)!;
          return {
            id: p.id, investment_id: p.investment_id, investment_code: inv.code, currency: inv.currency, investor_name: investorName(inv.investor_user_id),
            amount_cents: p.amount_cents, allocated_cents: p.allocations.reduce((s, a) => s + a.amount_cents, 0),
            paid_at: p.paid_at, status: p.status, reference: p.reference, notes: p.notes
          };
        });
      return paginate(rows, q);
    },
    async recordPayment(input) {
      requireAdmin();
      if (!input.reference.trim()) return fail(400, 'PAYMENT_ERROR', 'La referencia bancaria es obligatoria.');
      const total = input.allocations.reduce((s, a) => s + a.amount_cents, 0);
      if (total > input.amount_cents) return fail(400, 'PAYMENT_ERROR', 'El total asignado no puede ser mayor que el monto del pago.');
      for (const a of input.allocations) {
        const y = db.yields.find((x) => x.id === a.yield_entry_id && x.investment_id === input.investment_id && x.status === 'CONFIRMED');
        if (!y) return fail(400, 'PAYMENT_ERROR', 'Partida de rendimiento no encontrada o no confirmada.');
        if (a.amount_cents > adminYield(y).pending_cents) return fail(400, 'PAYMENT_ERROR', 'La asignación excede el saldo pendiente de la partida.');
      }
      const id = nextId(db, 'pay');
      db.payments.push({ id, investment_id: input.investment_id, amount_cents: input.amount_cents, paid_at: input.paid_at, status: 'CONFIRMED', reference: input.reference, notes: input.notes ?? null, allocations: input.allocations });
      const inv = db.investments.find((i) => i.id === input.investment_id);
      if (inv) notify(inv.investor_user_id, 'PAYMENT_RECORDED', 'Confirmación de pago registrado');
      audit('EXTERNAL_PAYMENT_RECORDED', 'PAYMENT_RECORD', id, { reference: input.reference, amount_cents: input.amount_cents });
      return { payment_id: id };
    },
    async reinvest(investmentId, input) {
      requireAdmin();
      const inv = db.investments.find((i) => i.id === investmentId);
      if (!inv) return fail(404, 'NOT_FOUND', 'Inversión no encontrada.');
      if (inv.capitalization_policy !== 'COMPOUND_TO_CAPITAL') return fail(400, 'REINVESTMENT_ERROR', 'El contrato de esta inversión no permite reinversión.');
      const y = db.yields.find((x) => x.id === input.yield_entry_id && x.status === 'CONFIRMED');
      if (!y) return fail(400, 'REINVESTMENT_ERROR', 'Partida confirmada no encontrada.');
      const b = yieldBalances(y.id);
      if (b.paid > 0 || b.reinvested > 0) return fail(400, 'REINVESTMENT_ERROR', 'La partida ya tiene pagos o reinversión.');
      db.movements.push({ id: nextId(db, 'mov'), investment_id: inv.id, movement_type: 'REINVESTMENT_CREDIT', amount_cents: y.amount_cents, effective_date: input.effective_date, yield_entry_id: y.id });
      inv.current_capital_cents += y.amount_cents;
      audit('YIELD_REINVESTED', 'REINVESTMENT', y.id, { amount_cents: y.amount_cents });
      return { new_capital_cents: inv.current_capital_cents };
    },
    async documents(q) {
      requireAdmin();
      const rows = db.documents
        .filter((d) => !d.is_archived && (!q.investment_id || d.investment_id === q.investment_id))
        .sort(byDesc((d) => d.created_at))
        .map(({ is_archived: _a, ...d }) => ({ ...d, investment_code: db.investments.find((i) => i.id === d.investment_id)?.code }));
      return paginate(rows, q);
    },
    async uploadDocument(input) {
      requireAdmin();
      const inv = db.investments.find((i) => i.id === input.investment_id);
      if (!inv) return fail(404, 'NOT_FOUND', 'Inversión no encontrada.');
      if (!['application/pdf', 'image/png', 'image/jpeg'].includes(input.file.type)) return fail(400, 'UPLOAD_ERROR', 'Solo se admiten PDF, PNG o JPEG.');
      if (input.file.size > 15 * 1024 * 1024) return fail(400, 'UPLOAD_ERROR', 'El archivo excede 15 MB.');
      const id = nextId(db, 'doc');
      db.documents.push({
        id, investment_id: inv.id, title: input.title, document_type: input.document_type, original_filename: input.file.name,
        size_bytes: input.file.size, content_type: input.file.type, created_at: nowIso(), is_archived: false
      });
      audit('DOCUMENT_UPLOADED', 'DOCUMENT', id, { title: input.title });
      return { id };
    },
    async downloadDocument(id) {
      requireAdmin();
      const doc = db.documents.find((d) => d.id === id && !d.is_archived);
      if (!doc) return fail(404, 'DOCUMENT_ERROR', 'Documento no encontrado o no disponible.');
      return { blob: fictitiousPdf(doc.title), filename: doc.original_filename };
    },
    async archiveDocument(id) {
      requireAdmin();
      const d = db.documents.find((x) => x.id === id);
      if (!d) return fail(404, 'NOT_FOUND', 'Documento no encontrado.');
      d.is_archived = true;
      audit('DOCUMENT_ARCHIVED', 'DOCUMENT', id, { title: d.title });
    },
    async notifications(q) {
      requireAdmin();
      const rows = db.notifications.filter((n) => !q.status || n.status === q.status).sort(byDesc((n) => n.created_at));
      return paginate(rows, q);
    },
    async auditLogs(q) {
      requireAdmin();
      const term = (q.action ?? '').trim().toUpperCase();
      const rows = db.audit.filter((a) => !term || a.action.includes(term)).sort(byDesc((a) => a.created_at));
      return paginate(rows, { page: q.page, pageSize: q.pageSize ?? 20 });
    },
    async referenceRates(q) {
      requireAdmin();
      const rows = db.rates
        .filter((r) => !q.rate_code || r.rate_code === q.rate_code)
        .sort(byDesc((r) => r.effective_date))
        .map((r) => ({ ...r, created_by: 'admin@ficticio.test', in_use: db.yields.some((y) => y.reference_rate_id === r.id) }));
      return paginate(rows, q);
    },
    async createReferenceRate(input) {
      requireAdmin();
      if (db.rates.some((r) => r.rate_code === input.rate_code && r.effective_date === input.effective_date)) {
        return fail(409, 'REFERENCE_RATE_EXISTS', 'Ya existe una tasa capturada para ese plazo y fecha.');
      }
      if (input.effective_date > today()) return fail(400, 'INVALID_INPUT', 'No se capturan tasas con fecha futura.');
      const id = nextId(db, 'rrt');
      db.rates.push({ id, rate_code: input.rate_code, effective_date: input.effective_date, annual_rate_bps: input.annual_rate_bps, source: input.source ?? null, created_at: nowIso() });
      audit('REFERENCE_RATE_RECORDED', 'REFERENCE_RATE', id, { ...input });
      return { id };
    },
    async deleteReferenceRate(id) {
      requireAdmin();
      if (db.yields.some((y) => y.reference_rate_id === id)) return fail(409, 'REFERENCE_RATE_IN_USE', 'Esta tasa ya se usó en un rendimiento confirmado; no se puede modificar ni borrar.');
      db.rates = db.rates.filter((r) => r.id !== id);
      audit('REFERENCE_RATE_DELETED', 'REFERENCE_RATE', id, {});
    }
  })
};
