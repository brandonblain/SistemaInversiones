// Servicio de Auditoría Inmutable (la tabla tiene triggers que impiden UPDATE/DELETE)
import { generateSecureToken } from './crypto';

export interface AuditLogEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Sentencia preparada para incluir la auditoría en el mismo lote (transacción) que la operación. */
export function auditStatement(db: D1Database, entry: AuditLogEntry): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, old_values_json, new_values_json, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      generateSecureToken('aud'),
      entry.userId || null,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.oldValues ? JSON.stringify(entry.oldValues) : null,
      entry.newValues ? JSON.stringify(entry.newValues) : null,
      entry.ipAddress || null,
      entry.userAgent ? entry.userAgent.slice(0, 300) : null
    );
}

export async function recordAuditLog(db: D1Database, entry: AuditLogEntry): Promise<void> {
  await auditStatement(db, entry).run();
}
