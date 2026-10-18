-- Migración 0002: campos solicitados por el cliente, seguridad de acceso e invariantes financieros en base de datos.
-- Base de Datos: Cloudflare D1 (SQLite). Los triggers hacen cumplir las reglas aunque haya peticiones concurrentes:
-- D1 ejecuta cada lote (batch) como transacción, y un RAISE(ABORT) revierte el lote completo.

-- ---------------------------------------------------------------------------
-- 1. Ramo de la inversión (Fast Food / Movilidad / Transporte)
--    El DEFAULT solo aplica a filas previas a esta migración (no hay datos productivos aún);
--    la API exige el campo explícitamente en cada alta.
-- ---------------------------------------------------------------------------
ALTER TABLE investments ADD COLUMN investment_type TEXT NOT NULL DEFAULT 'MOBILITY'
  CHECK (investment_type IN ('FAST_FOOD', 'MOBILITY', 'TRANSPORT'));

-- ---------------------------------------------------------------------------
-- 2. Beneficiarios del inversionista (porcentaje en puntos básicos: 10000 = 100.00 %)
--    La suma = 100 % se valida en el servicio dentro del mismo lote de alta.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS investor_beneficiaries (
  id TEXT PRIMARY KEY,
  investor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) >= 3),
  relationship TEXT NOT NULL CHECK (relationship IN ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER')),
  percentage_bps INTEGER NOT NULL CHECK (percentage_bps > 0 AND percentage_bps <= 10000),
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user ON investor_beneficiaries(investor_user_id);

-- ---------------------------------------------------------------------------
-- 3. Autenticación: MFA sin sobrescribir el secreto activo, anti-replay TOTP y bloqueo por intentos
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN mfa_pending_secret TEXT NULL;
ALTER TABLE users ADD COLUMN mfa_last_counter INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id);

-- ---------------------------------------------------------------------------
-- 4. Notas en partidas de rendimiento y avisos por inversión
-- ---------------------------------------------------------------------------
ALTER TABLE yield_entries ADD COLUMN note TEXT NULL;
ALTER TABLE notification_events ADD COLUMN investment_id TEXT NULL REFERENCES investments(id);
CREATE INDEX IF NOT EXISTS idx_notifications_investment ON notification_events(investment_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notification_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_reinvestments_yield ON reinvestments(yield_entry_id);

-- ---------------------------------------------------------------------------
-- 5. Unicidad e idempotencia
-- ---------------------------------------------------------------------------
-- Un solo devengo AUTOMÁTICO confirmado por periodo exacto (los ajustes manuales sí pueden coexistir).
DROP INDEX IF EXISTS uq_yield_active_period;
CREATE UNIQUE INDEX IF NOT EXISTS uq_yield_auto_period
  ON yield_entries (investment_id, period_start, period_end)
  WHERE status = 'CONFIRMED' AND source = 'AUTO';

-- Una partida solo puede reversarse una vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_yield_reversal
  ON yield_entries (reversal_of_yield_id)
  WHERE reversal_of_yield_id IS NOT NULL;

-- La misma referencia bancaria no puede registrarse dos veces en una inversión (doble clic / reintento).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_reference
  ON payment_records (investment_id, reference)
  WHERE status = 'CONFIRMED';

-- ---------------------------------------------------------------------------
-- 6. Invariantes financieros (triggers)
-- ---------------------------------------------------------------------------

-- 6.1 Devengos automáticos confirmados no pueden traslaparse en la misma inversión.
CREATE TRIGGER IF NOT EXISTS trg_yield_auto_no_overlap
BEFORE INSERT ON yield_entries
WHEN NEW.source = 'AUTO' AND NEW.status = 'CONFIRMED'
BEGIN
  SELECT RAISE(ABORT, 'YIELD_PERIOD_OVERLAP')
  WHERE EXISTS (
    SELECT 1 FROM yield_entries y
    WHERE y.investment_id = NEW.investment_id
      AND y.status = 'CONFIRMED' AND y.source = 'AUTO'
      AND y.period_start < NEW.period_end AND y.period_end > NEW.period_start
  );
END;

-- 6.2 Las partidas son inmutables salvo el cambio de estado CONFIRMED → REVERSED.
CREATE TRIGGER IF NOT EXISTS trg_yield_immutable
BEFORE UPDATE ON yield_entries
WHEN NEW.amount_cents IS NOT OLD.amount_cents
  OR NEW.period_start IS NOT OLD.period_start
  OR NEW.period_end IS NOT OLD.period_end
  OR NEW.investment_id IS NOT OLD.investment_id
  OR NEW.source IS NOT OLD.source
  OR NOT (NEW.status = OLD.status OR (OLD.status = 'CONFIRMED' AND NEW.status = 'REVERSED'))
BEGIN
  SELECT RAISE(ABORT, 'YIELD_ENTRY_IMMUTABLE');
END;

-- 6.3 No se reversa una partida con pagos o reinversión asignados.
CREATE TRIGGER IF NOT EXISTS trg_yield_reverse_guard
BEFORE UPDATE OF status ON yield_entries
WHEN OLD.status = 'CONFIRMED' AND NEW.status = 'REVERSED'
BEGIN
  SELECT RAISE(ABORT, 'YIELD_HAS_SETTLEMENTS')
  WHERE EXISTS (
      SELECT 1 FROM payment_allocations a JOIN payment_records p ON p.id = a.payment_record_id
      WHERE a.yield_entry_id = OLD.id AND p.status = 'CONFIRMED')
    OR EXISTS (SELECT 1 FROM reinvestments r WHERE r.yield_entry_id = OLD.id AND r.status = 'CONFIRMED');
END;

-- 6.4 Asignaciones: misma inversión, partida confirmada positiva, sin exceder su saldo ni el monto del pago.
CREATE TRIGGER IF NOT EXISTS trg_allocation_validate
BEFORE INSERT ON payment_allocations
BEGIN
  SELECT RAISE(ABORT, 'ALLOCATION_YIELD_NOT_ALLOCATABLE')
  WHERE NOT EXISTS (
    SELECT 1 FROM yield_entries y
    JOIN payment_records p ON p.id = NEW.payment_record_id
    WHERE y.id = NEW.yield_entry_id AND y.investment_id = p.investment_id
      AND y.status = 'CONFIRMED' AND y.amount_cents > 0
  );
  SELECT RAISE(ABORT, 'ALLOCATION_EXCEEDS_PENDING')
  WHERE NEW.amount_cents > (
    SELECT y.amount_cents
      - COALESCE((SELECT SUM(a.amount_cents) FROM payment_allocations a
                  JOIN payment_records p2 ON p2.id = a.payment_record_id
                  WHERE a.yield_entry_id = y.id AND p2.status = 'CONFIRMED'), 0)
      - COALESCE((SELECT SUM(r.amount_cents) FROM reinvestments r
                  WHERE r.yield_entry_id = y.id AND r.status = 'CONFIRMED'), 0)
    FROM yield_entries y WHERE y.id = NEW.yield_entry_id
  );
  SELECT RAISE(ABORT, 'ALLOCATION_EXCEEDS_PAYMENT')
  WHERE NEW.amount_cents
    + COALESCE((SELECT SUM(amount_cents) FROM payment_allocations WHERE payment_record_id = NEW.payment_record_id), 0)
    > (SELECT amount_cents FROM payment_records WHERE id = NEW.payment_record_id);
END;

-- 6.5 Reinversión: partida confirmada de la misma inversión, por su importe completo y sin pagos.
CREATE TRIGGER IF NOT EXISTS trg_reinvestment_validate
BEFORE INSERT ON reinvestments
BEGIN
  SELECT RAISE(ABORT, 'REINVEST_YIELD_NOT_ELIGIBLE')
  WHERE NOT EXISTS (
      SELECT 1 FROM yield_entries y
      WHERE y.id = NEW.yield_entry_id AND y.investment_id = NEW.investment_id
        AND y.status = 'CONFIRMED' AND y.amount_cents = NEW.amount_cents AND y.amount_cents > 0)
    OR EXISTS (
      SELECT 1 FROM payment_allocations a JOIN payment_records p ON p.id = a.payment_record_id
      WHERE a.yield_entry_id = NEW.yield_entry_id AND p.status = 'CONFIRMED');
END;

-- 6.6 Bitácora y movimientos de capital: solo inserción.
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'AUDIT_LOG_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_capital_no_update BEFORE UPDATE ON capital_movements
BEGIN SELECT RAISE(ABORT, 'CAPITAL_MOVEMENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_capital_no_delete BEFORE DELETE ON capital_movements
BEGIN SELECT RAISE(ABORT, 'CAPITAL_MOVEMENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_payment_no_delete BEFORE DELETE ON payment_records
BEGIN SELECT RAISE(ABORT, 'PAYMENT_RECORD_IMMUTABLE'); END;
