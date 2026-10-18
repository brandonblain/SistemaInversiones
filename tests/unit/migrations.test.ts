import { describe, expect, it } from 'vitest';
import { createTestD1Database } from '../helpers/d1-mock';

async function seedBase(db: D1Database) {
  await db.batch([
    db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES ('u_adm', 'a@ficticio.test', 'x', 'ADMIN')"),
    db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES ('u_inv', 'i@ficticio.test', 'x', 'INVESTOR')"),
    db.prepare(
      `INSERT INTO investments (id, investor_user_id, code, investment_type, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents)
       VALUES ('inv1', 'u_inv', 'FICT-1', 'TRANSPORT', 'MXN', '2026-01-01', '2027-01-01', 1000000, 1000000)`
    ),
    db.prepare(
      `INSERT INTO investments (id, investor_user_id, code, investment_type, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents)
       VALUES ('inv2', 'u_inv', 'FICT-2', 'MOBILITY', 'USD', '2026-01-01', '2027-01-01', 1000000, 1000000)`
    )
  ]);
}

const yieldSql = (id: string, inv: string, start: string, end: string, amount: number, source = 'AUTO') =>
  `INSERT INTO yield_entries (id, investment_id, period_start, period_end, days_count, reference_capital_cents, rate_bps, amount_cents, status, source, created_by_user_id)
   VALUES ('${id}', '${inv}', '${start}', '${end}', 31, 1000000, 1200, ${amount}, 'CONFIRMED', '${source}', 'u_adm')`;

describe('Migraciones D1 0001 → 0003', () => {
  it('crea tablas nuevas, columnas y triggers', async () => {
    const db = createTestD1Database();
    const names = (await db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','trigger')").all<{ name: string }>()).results.map((r) => r.name);
    for (const t of ['investor_beneficiaries', 'login_attempts', 'reference_rates', 'trg_allocation_validate', 'trg_yield_auto_no_overlap', 'trg_audit_no_update', 'trg_reinvestment_validate', 'trg_reference_rate_locked_delete']) {
      expect(names).toContain(t);
    }
    expect(names.some((n) => n.startsWith('_mig0003'))).toBe(false);
    await seedBase(db);
    const inv2 = await db.prepare("SELECT currency FROM investments WHERE id = 'inv2'").first<{ currency: string }>();
    expect(inv2?.currency).toBe('USD');
  });

  it('CHECK: tipo de inversión, parentesco y porcentaje', async () => {
    const db = createTestD1Database();
    await seedBase(db);
    await expect(db.prepare("UPDATE investments SET investment_type = 'CRYPTO' WHERE id = 'inv1'").run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare("UPDATE investments SET currency = 'EUR' WHERE id = 'inv1'").run()).rejects.toThrow(/CHECK/);
    // CETES solo en pesos
    await expect(db.prepare("UPDATE investments SET investment_type = 'CETES' WHERE id = 'inv2'").run()).rejects.toThrow(/CHECK/);
    // Términos: tasa fija XOR referencia + diferencial; modalidad anual permitida
    await db.prepare("INSERT INTO investment_terms (id, investment_id, rate_type, fixed_annual_rate_bps, payout_frequency, effective_from) VALUES ('t1','inv1','FIXED',1200,'ANNUAL','2026-01-01')").run();
    await db.prepare("INSERT INTO investment_terms (id, investment_id, rate_type, reference_rate_code, spread_bps, payout_frequency, effective_from) VALUES ('t2','inv1','REFERENCE','CETES_28',-100,'MONTHLY','2026-01-01')").run();
    await expect(db.prepare("INSERT INTO investment_terms (id, investment_id, rate_type, fixed_annual_rate_bps, reference_rate_code, spread_bps, payout_frequency, effective_from) VALUES ('t3','inv1','REFERENCE',1200,'CETES_28',-100,'MONTHLY','2026-01-01')").run()).rejects.toThrow(/CHECK/);
    await expect(db.prepare("INSERT INTO investment_terms (id, investment_id, rate_type, payout_frequency, effective_from) VALUES ('t4','inv1','FIXED','MONTHLY','2026-01-01')").run()).rejects.toThrow(/CHECK/);
    await expect(
      db.prepare("INSERT INTO investor_beneficiaries (id, investor_user_id, full_name, relationship, percentage_bps, created_by_user_id) VALUES ('b1','u_inv','Persona FICTICIA','COUSIN',5000,'u_adm')").run()
    ).rejects.toThrow(/CHECK/);
    await expect(
      db.prepare("INSERT INTO investor_beneficiaries (id, investor_user_id, full_name, relationship, percentage_bps, created_by_user_id) VALUES ('b2','u_inv','Persona FICTICIA','CHILD',10001,'u_adm')").run()
    ).rejects.toThrow(/CHECK/);
  });

  it('devengos automáticos no se traslapan; los manuales sí pueden coexistir', async () => {
    const db = createTestD1Database();
    await seedBase(db);
    await db.prepare(yieldSql('y1', 'inv1', '2026-01-01', '2026-02-01', 100)).run();
    await expect(db.prepare(yieldSql('y2', 'inv1', '2026-01-15', '2026-02-15', 100)).run()).rejects.toThrow(/YIELD_PERIOD_OVERLAP/);
    await expect(db.prepare(yieldSql('y3', 'inv1', '2026-01-01', '2026-02-01', 100)).run()).rejects.toThrow();
    await db.prepare(yieldSql('y4', 'inv1', '2026-01-01', '2026-02-01', -20, 'MANUAL')).run();
    await db.prepare(yieldSql('y5', 'inv1', '2026-02-01', '2026-03-01', 100)).run(); // contiguo: válido
  });

  it('las partidas son inmutables (solo CONFIRMED → REVERSED)', async () => {
    const db = createTestD1Database();
    await seedBase(db);
    await db.prepare(yieldSql('y1', 'inv1', '2026-01-01', '2026-02-01', 100)).run();
    await expect(db.prepare("UPDATE yield_entries SET amount_cents = 999 WHERE id = 'y1'").run()).rejects.toThrow(/YIELD_ENTRY_IMMUTABLE/);
    await db.prepare("UPDATE yield_entries SET status = 'REVERSED' WHERE id = 'y1'").run();
    await expect(db.prepare("UPDATE yield_entries SET status = 'CONFIRMED' WHERE id = 'y1'").run()).rejects.toThrow(/YIELD_ENTRY_IMMUTABLE/);
  });

  it('asignaciones: no exceden el saldo de la partida ni el monto del pago; no cruzan inversiones', async () => {
    const db = createTestD1Database();
    await seedBase(db);
    await db.prepare(yieldSql('y1', 'inv1', '2026-01-01', '2026-02-01', 1000)).run();
    await db.prepare(yieldSql('y9', 'inv2', '2026-01-01', '2026-02-01', 1000)).run();
    await db.prepare("INSERT INTO payment_records (id, investment_id, amount_cents, paid_at, reference, recorded_by_user_id) VALUES ('p1','inv1',800,'2026-02-02T10:00:00Z','REF-1','u_adm')").run();
    await db.prepare("INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents) VALUES ('a1','p1','y1',600)").run();
    await expect(db.prepare("INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents) VALUES ('a2','p1','y1',300)").run()).rejects.toThrow(/ALLOCATION_EXCEEDS_PAYMENT/);
    await db.prepare("INSERT INTO payment_records (id, investment_id, amount_cents, paid_at, reference, recorded_by_user_id) VALUES ('p2','inv1',900,'2026-02-03T10:00:00Z','REF-2','u_adm')").run();
    await expect(db.prepare("INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents) VALUES ('a3','p2','y1',500)").run()).rejects.toThrow(/ALLOCATION_EXCEEDS_PENDING/);
    await expect(db.prepare("INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents) VALUES ('a4','p2','y9',100)").run()).rejects.toThrow(/ALLOCATION_YIELD_NOT_ALLOCATABLE/);
    // No se puede reversar una partida con pagos
    await expect(db.prepare("UPDATE yield_entries SET status = 'REVERSED' WHERE id = 'y1'").run()).rejects.toThrow(/YIELD_HAS_SETTLEMENTS/);
    // Referencia bancaria duplicada en la misma inversión
    await expect(db.prepare("INSERT INTO payment_records (id, investment_id, amount_cents, paid_at, reference, recorded_by_user_id) VALUES ('p3','inv1',1,'2026-02-03T10:00:00Z','REF-1','u_adm')").run()).rejects.toThrow(/UNIQUE/);
  });

  it('bitácora y movimientos de capital son de solo inserción', async () => {
    const db = createTestD1Database();
    await seedBase(db);
    await db.prepare("INSERT INTO audit_logs (id, action, entity_type, entity_id) VALUES ('l1','X','T','e')").run();
    await expect(db.prepare("UPDATE audit_logs SET action = 'Y' WHERE id = 'l1'").run()).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
    await expect(db.prepare("DELETE FROM audit_logs WHERE id = 'l1'").run()).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
    await db.prepare("INSERT INTO capital_movements (id, investment_id, movement_type, amount_cents, effective_date, recorded_by_user_id) VALUES ('m1','inv1','INITIAL_DEPOSIT',1000000,'2026-01-01','u_adm')").run();
    await expect(db.prepare("DELETE FROM capital_movements WHERE id = 'm1'").run()).rejects.toThrow(/CAPITAL_MOVEMENT_IMMUTABLE/);
  });

  it('batch es atómico: si un trigger aborta, nada del lote persiste', async () => {
    const db = createTestD1Database();
    await seedBase(db);
    await db.prepare(yieldSql('y1', 'inv1', '2026-01-01', '2026-02-01', 100)).run();
    await expect(
      db.batch([
        db.prepare("INSERT INTO payment_records (id, investment_id, amount_cents, paid_at, reference, recorded_by_user_id) VALUES ('pX','inv1',500,'2026-02-02T10:00:00Z','REF-X','u_adm')"),
        db.prepare("INSERT INTO payment_allocations (id, payment_record_id, yield_entry_id, amount_cents) VALUES ('aX','pX','y1',500)")
      ])
    ).rejects.toThrow(/ALLOCATION_EXCEEDS_PENDING/);
    expect(await db.prepare("SELECT id FROM payment_records WHERE id = 'pX'").first()).toBeNull();
  });
});
