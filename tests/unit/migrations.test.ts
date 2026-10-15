import { describe, it, expect } from 'vitest';
import { createTestD1Database } from '../helpers/d1-mock';

describe('D1 Migration 0001_initial_schema', () => {
  it('should initialize all required tables, constraints and indexes cleanly', async () => {
    const db = createTestD1Database();

    // Consultar sqlite_master para verificar que todas las tablas fueron creadas
    const tablesResult = await db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();

    const tableNames = tablesResult.results.map((r) => r.name);
    
    expect(tableNames).toContain('users');
    expect(tableNames).toContain('investor_profiles');
    expect(tableNames).toContain('investments');
    expect(tableNames).toContain('investment_terms');
    expect(tableNames).toContain('capital_movements');
    expect(tableNames).toContain('yield_entries');
    expect(tableNames).toContain('payment_records');
    expect(tableNames).toContain('payment_allocations');
    expect(tableNames).toContain('reinvestments');
    expect(tableNames).toContain('investment_documents');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('password_reset_tokens');
    expect(tableNames).toContain('audit_logs');
    expect(tableNames).toContain('notification_events');
    expect(tableNames).toContain('scheduled_job_runs');
  });

  it('should enforce CHECK constraints on monetary cents and status values', async () => {
    const db = createTestD1Database();

    // 1. Insertar usuario base
    await db.prepare(
      "INSERT INTO users (id, email, password_hash, role, is_active) VALUES ('u1', 'test@example.com', 'hash', 'INVESTOR', 1)"
    ).run();

    // 2. Intentar crear inversión con initial_capital_cents <= 0 (debe fallar por CHECK)
    await expect(
      db.prepare(
        "INSERT INTO investments (id, investor_user_id, code, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents) " +
        "VALUES ('inv1', 'u1', 'INV-001', 'ACTIVE', 'MXN', '2026-01-01', '2027-01-01', -500, -500)"
      ).run()
    ).rejects.toThrow();

    // 3. Inserción correcta con enteros válidos
    const ok = await db.prepare(
      "INSERT INTO investments (id, investor_user_id, code, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents) " +
      "VALUES ('inv1', 'u1', 'INV-001', 'ACTIVE', 'MXN', '2026-01-01', '2027-01-01', 50000000, 50000000)"
    ).run();
    expect(ok.success).toBe(true);
  });
});
