// Tipos según docs/api-contract.md (v1.0.0-draft).
// Los marcados "PROPUESTO" no existen aún en el contrato: ver docs/frontend-integraciones-pendientes.md

export type Role = 'ADMIN' | 'INVESTOR';
export type InvestmentStatus = 'DRAFT' | 'ACTIVE' | 'MATURED' | 'CANCELLED';
export type PayoutFrequency = 'MONTHLY' | 'SEMIANNUAL' | 'AT_MATURITY';
export type DayCountConvention = 'ACT_365' | 'ACT_360' | 'THIRTY_360';
export type CapitalizationPolicy = 'NONE' | 'COMPOUND_TO_CAPITAL';
export type DocumentType = 'CONTRACT' | 'ADDENDUM' | 'ACCOUNT_STATEMENT' | 'TAX_RECEIPT' | 'OTHER';
export type YieldStatus = 'DRAFT' | 'CONFIRMED' | 'REVERSED';
export type YieldSource = 'AUTO' | 'MANUAL' | 'ADJUSTMENT' | 'REVERSAL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';
/** PROPUESTO: ramo del negocio en el que se apalanca la inversión. */
export type InvestmentType = 'FAST_FOOD' | 'MOBILITY' | 'TRANSPORT';
export type Relationship = 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'OTHER';

/** PROPUESTO: beneficiario del inversionista. percentage_bps: 10000 = 100.00 %. */
export interface Beneficiary {
  id?: string;
  full_name: string;
  relationship: Relationship;
  percentage_bps: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  is_active: boolean;
  mfa_enabled?: boolean;
}

export interface InvestorProfile {
  id: string;
  full_name: string;
  rfc: string | null;
  phone: string | null;
  address?: string | null;
}

export interface Session {
  user: User;
  investor_profile: InvestorProfile | null;
}

export interface LoginInput {
  email: string;
  password: string;
  mfa_token?: string;
}

export interface InvestorSummary {
  currency: 'MXN';
  total_capital_cents: number;
  total_yield_generated_cents: number;
  total_yield_confirmed_cents: number;
  total_yield_paid_cents: number;
  total_yield_reinvested_cents: number;
  total_yield_pending_cents: number;
  active_investments_count: number;
  as_of_date: string;
}

export interface InvestmentTerms {
  fixed_annual_rate_bps: number;
  payout_frequency: PayoutFrequency;
  day_count_convention: DayCountConvention;
  capitalization_policy: CapitalizationPolicy;
}

export interface InvestmentListItem {
  id: string;
  code: string;
  investment_type: InvestmentType;
  status: InvestmentStatus;
  currency: 'MXN';
  start_date: string;
  maturity_date: string;
  current_capital_cents: number;
  terms: InvestmentTerms;
  stats: {
    yield_confirmed_cents: number;
    yield_paid_cents: number;
    yield_reinvested_cents?: number;
    yield_pending_cents: number;
  };
}

/** Saldo desglosado de una inversión (nombres normalizados en el frontend). */
export interface InvestmentBalance {
  capital_cents: number;
  yield_generated_cents: number;
  yield_confirmed_cents: number;
  yield_paid_cents: number;
  yield_reinvested_cents: number;
  yield_pending_cents: number;
}

export interface InvestmentDetail {
  id: string;
  code: string;
  investment_type: InvestmentType;
  status: InvestmentStatus;
  currency: 'MXN';
  start_date: string;
  maturity_date: string;
  initial_capital_cents: number;
  current_capital_cents: number;
  terms: InvestmentTerms;
  balance: InvestmentBalance;
}

export type HistoryType = 'ALL' | 'YIELDS' | 'PAYMENTS' | 'CAPITAL';

export interface HistoryEntry {
  entry_type: 'YIELD' | 'PAYMENT' | 'CAPITAL';
  id: string;
  effective_date: string;
  period_start?: string | null;
  period_end?: string | null;
  amount_cents: number;
  status: string;
  source?: YieldSource;
  paid_amount_cents?: number;
  pending_amount_cents?: number;
  reference?: string | null;
  note?: string | null;
}

/** PROPUESTO: serie para la gráfica de evolución, entregada ya calculada por la API. */
export interface InvestmentSeries {
  as_of_date: string;
  capital_points: Array<{ date: string; capital_cents: number }>;
  yield_periods: Array<{
    period_start: string;
    period_end: string;
    confirmed_cents: number;
    paid_cents: number;
    reinvested_cents: number;
    pending_cents: number;
  }>;
}

export interface InvestmentDocument {
  id: string;
  title: string;
  document_type: DocumentType;
  original_filename: string;
  size_bytes: number;
  content_type?: string;
  created_at: string;
  investment_id?: string;
  investment_code?: string;
}

export interface NotificationEvent {
  id: string;
  event_type: string;
  subject: string;
  status: NotificationStatus;
  created_at: string;
  recipient_email?: string;
  attempts_count?: number;
  error_message?: string | null;
  user_id?: string;
}

// ---------- Administración ----------

export interface AdminSummary {
  investors_count: number;
  active_investments_count: number;
  total_capital_cents: number;
  yield_pending_cents: number;
  maturing_soon_count: number;
  notifications_failed_count: number;
  as_of_date: string;
}

export interface AdminInvestorRow {
  id: string;
  email: string;
  is_active: number | boolean;
  created_at: string;
  profile_id: string | null;
  full_name: string | null;
  rfc: string | null;
  phone: string | null;
  address?: string | null;
  investments_count: number;
}

export interface AdminInvestorDetail {
  user: { id: string; email: string; is_active: boolean; created_at: string };
  profile: InvestorProfile | null;
  beneficiaries: Beneficiary[];
  investments: InvestmentListItem[];
}

export interface CreateInvestorInput {
  email: string;
  password: string;
  full_name: string;
  rfc?: string;
  phone?: string;
  address?: string;
  notes?: string;
  beneficiaries: Beneficiary[];
}

export interface AdminInvestmentRow {
  id: string;
  investor_user_id: string;
  code: string;
  investment_type: InvestmentType;
  status: InvestmentStatus;
  currency: 'MXN';
  start_date: string;
  maturity_date: string;
  initial_capital_cents: number;
  current_capital_cents: number;
  investor_name: string | null;
  investor_email: string;
  fixed_annual_rate_bps: number;
  payout_frequency: PayoutFrequency;
  day_count_convention: DayCountConvention;
  capitalization_policy: CapitalizationPolicy;
}

export interface CreateInvestmentInput {
  investor_user_id: string;
  code: string;
  investment_type: InvestmentType;
  start_date: string;
  maturity_date: string;
  capital_cents: number;
  fixed_annual_rate_bps: number;
  payout_frequency: PayoutFrequency;
  day_count_convention: DayCountConvention;
  capitalization_policy: CapitalizationPolicy;
  notes?: string;
}

export interface YieldPreview {
  investment_id?: string;
  period_start: string;
  period_end: string;
  days_in_period: number;
  capital_cents: number;
  annual_rate_bps: number;
  calculated_yield_cents: number;
  day_count_convention: DayCountConvention;
  calculation_formula: string;
}

export interface YieldPreviewInput {
  investment_id: string;
  period_start: string;
  period_end: string;
}

export interface ConfirmYieldInput extends YieldPreviewInput {
  amount_cents: number;
  note?: string;
}

export interface ManualYieldInput extends YieldPreviewInput {
  amount_cents: number;
  reason: string;
}

/** PROPUESTO: partidas de rendimiento de una inversión, con saldo pendiente calculado por la API. */
export interface AdminYieldEntry {
  id: string;
  investment_id: string;
  period_start: string;
  period_end: string;
  amount_cents: number;
  status: YieldStatus;
  source: YieldSource;
  paid_cents: number;
  reinvested_cents: number;
  pending_cents: number;
  note: string | null;
  created_at: string;
}

export interface PaymentAllocationInput {
  yield_entry_id: string;
  amount_cents: number;
}

export interface RecordPaymentInput {
  investment_id: string;
  amount_cents: number;
  paid_at: string;
  reference: string;
  notes?: string;
  allocations: PaymentAllocationInput[];
}

/** PROPUESTO */
export interface AdminPaymentRow {
  id: string;
  investment_id: string;
  investment_code: string;
  investor_name: string | null;
  amount_cents: number;
  allocated_cents: number;
  paid_at: string;
  status: 'CONFIRMED' | 'CANCELLED';
  reference: string;
  notes: string | null;
}

export interface ReinvestInput {
  yield_entry_id: string;
  effective_date: string;
  notes?: string;
}

export interface UploadDocumentInput {
  investment_id: string;
  title: string;
  document_type: DocumentType;
  file: File;
}

export interface AuditLogRow {
  id: string;
  user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values_json: string | null;
  new_values_json: string | null;
  ip_address: string | null;
  created_at: string;
}

export interface MfaSetup {
  secret: string;
  otpauth_url: string;
}
