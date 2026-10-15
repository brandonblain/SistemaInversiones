-- Migración 0001: Esquema Inicial para Portal Privado de Inversionistas
-- Base de Datos: Cloudflare D1 (SQLite)

-- 1. Usuarios del sistema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'INVESTOR')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  mfa_secret TEXT NULL,
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Perfil de Inversionista (Solo lectura para el inversionista en el MVP)
CREATE TABLE IF NOT EXISTS investor_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  rfc TEXT NULL,
  phone TEXT NULL,
  address TEXT NULL,
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. Inversiones / Contratos
CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT', 'ACTIVE', 'MATURED', 'CANCELLED')),
  currency TEXT NOT NULL DEFAULT 'MXN' CHECK (currency = 'MXN'),
  start_date TEXT NOT NULL,
  maturity_date TEXT NOT NULL,
  initial_capital_cents INTEGER NOT NULL CHECK (initial_capital_cents > 0),
  current_capital_cents INTEGER NOT NULL CHECK (current_capital_cents >= 0),
  notes TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 4. Términos y Parámetros Financieros Contractuales
CREATE TABLE IF NOT EXISTS investment_terms (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  fixed_annual_rate_bps INTEGER NOT NULL CHECK (fixed_annual_rate_bps > 0 AND fixed_annual_rate_bps <= 100000),
  payout_frequency TEXT NOT NULL CHECK (payout_frequency IN ('MONTHLY', 'SEMIANNUAL', 'AT_MATURITY')),
  day_count_convention TEXT NOT NULL DEFAULT 'ACT_365' CHECK (day_count_convention IN ('ACT_365', 'ACT_360', 'THIRTY_360')),
  capitalization_policy TEXT NOT NULL DEFAULT 'NONE' CHECK (capitalization_policy IN ('NONE', 'COMPOUND_TO_CAPITAL')),
  effective_from TEXT NOT NULL,
  effective_to TEXT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 5. Movimientos de Capital (Depósito inicial, aportación, retiro, reinversión)
CREATE TABLE IF NOT EXISTS capital_movements (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('INITIAL_DEPOSIT', 'CAPITAL_CONTRIBUTION', 'CAPITAL_WITHDRAWAL', 'REINVESTMENT_CREDIT')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  effective_date TEXT NOT NULL,
  notes TEXT NULL,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. Partidas de Rendimiento (Devengo, Ajuste, Reversión)
CREATE TABLE IF NOT EXISTS yield_entries (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  days_count INTEGER NOT NULL CHECK (days_count > 0),
  reference_capital_cents INTEGER NOT NULL CHECK (reference_capital_cents > 0),
  rate_bps INTEGER NOT NULL CHECK (rate_bps > 0),
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('DRAFT', 'CONFIRMED', 'REVERSED')),
  source TEXT NOT NULL DEFAULT 'AUTO' CHECK (source IN ('AUTO', 'MANUAL', 'ADJUSTMENT', 'REVERSAL')),
  calculation_version TEXT NOT NULL DEFAULT 'v1.0',
  reversal_of_yield_id TEXT NULL REFERENCES yield_entries(id),
  reversal_reason TEXT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Restricción única para prevenir cálculo doble en un mismo periodo confirmado
CREATE UNIQUE INDEX IF NOT EXISTS uq_yield_active_period 
ON yield_entries (investment_id, period_start, period_end) 
WHERE status = 'CONFIRMED';

-- 7. Registro de Pagos Externos (Transferencia bancaria SPEI manual)
CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  reference TEXT NOT NULL,
  notes TEXT NULL,
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. Asignación de Pagos a Partidas de Rendimiento (Soporta pagos parciales o acumulados)
CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_record_id TEXT NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  yield_entry_id TEXT NOT NULL REFERENCES yield_entries(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(payment_record_id, yield_entry_id)
);

-- 9. Registro de Reinversiones
CREATE TABLE IF NOT EXISTS reinvestments (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  yield_entry_id TEXT NOT NULL UNIQUE REFERENCES yield_entries(id) ON DELETE RESTRICT,
  capital_movement_id TEXT NOT NULL REFERENCES capital_movements(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  effective_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  recorded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 10. Documentos y Contratos (R2 privado)
CREATE TABLE IF NOT EXISTS investment_documents (
  id TEXT PRIMARY KEY,
  investment_id TEXT NOT NULL REFERENCES investments(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('CONTRACT', 'ADDENDUM', 'ACCOUNT_STATEMENT', 'TAX_RECEIPT', 'OTHER')),
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 11. Sesiones de usuario (Cookies HttpOnly)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 12. Tokens de recuperación de contraseña
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 13. Bitácora de Auditoría Inmutable
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_values_json TEXT NULL,
  new_values_json TEXT NULL,
  ip_address TEXT NULL,
  user_agent TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 14. Eventos de Notificación por Correo
CREATE TABLE IF NOT EXISTS notification_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('PASSWORD_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PAYMENT_RECORDED', 'DOCUMENT_UPLOADED', 'CONTRACT_EXPIRING_SOON')),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_preview TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT NULL,
  error_message TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 15. Bitácora de Ejecución de Trabajos Programados (Cron)
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
  details_json TEXT NULL
);

-- Índices de Rendimiento y Búsqueda Segura por Titular
CREATE INDEX IF NOT EXISTS idx_investments_user ON investments(investor_user_id);
CREATE INDEX IF NOT EXISTS idx_terms_investment ON investment_terms(investment_id);
CREATE INDEX IF NOT EXISTS idx_movements_investment ON capital_movements(investment_id);
CREATE INDEX IF NOT EXISTS idx_yield_investment ON yield_entries(investment_id);
CREATE INDEX IF NOT EXISTS idx_payments_investment ON payment_records(investment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_yield ON payment_allocations(yield_entry_id);
CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_record_id);
CREATE INDEX IF NOT EXISTS idx_documents_investment ON investment_documents(investment_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
