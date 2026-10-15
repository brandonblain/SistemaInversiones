# Guía de Operaciones, Despliegue y Seguridad — Backend Cloudflare v2.0

**Servicio:** Portal Privado de Inversionistas (`portal-inversionistas-backend`)  
**Stack:** Cloudflare Workers Paid, TypeScript, Hono, D1 (SQLite), R2 privado, Vitest  
**Rama:** `feature/backend-financiero`  

---

## 1. Configuración de Entornos y Variables (`wrangler.jsonc`)

El backend cuenta con tres entornos aislados:
- **Local:** Simulación en memoria y D1 local para desarrollo y pruebas.
- **Staging (`--env staging`):** Entorno de validación con datos ficticios (`staging.portal-inversionistas.com`).
- **Production (`--env production`):** Entorno auditado de producción (`inversionistas.portal-privado.com`).

### Secretos Requeridos (Configurar con `wrangler secret put`)
Ejecutar por cada entorno (`staging` y `production`):
```bash
# Secreto para firma criptográfica
npx wrangler secret put JWT_SECRET --env production

# Secreto maestro de recuperación MFA
npx wrangler secret put ADMIN_MFA_SECRET --env production

# Clave de API de Email (si se usa proveedor externo transaccional)
npx wrangler secret put EMAIL_API_KEY --env production
```
*Nota: Ningún secreto está hardcodeado en el código fuente ni en los archivos de migración.*

---

## 2. Migraciones Versionadas de Base de Datos (Cloudflare D1)

Las migraciones residen en `migrations/` y deben ejecutarse en orden:
```bash
# 1. Aplicar en local
npm run d1:migrate:local

# 2. Aplicar en staging
npx wrangler d1 migrations apply portal-inversionistas-db-staging --env staging --remote

# 3. Aplicar en producción
npm run d1:migrate:prod
```

### Tablas Auditadas Creadas:
1. `users` (Roles `ADMIN`, `INVESTOR`, hash PBKDF2 WebCrypto, flags MFA)
2. `investor_profiles` (Datos de contacto de solo lectura para el cliente en MVP)
3. `investments` (Contratos, código único, capital inicial y vigente en centavos)
4. `investment_terms` (Tasa fija en bps, frecuencia de cobro, convención de días, política de reinversión)
5. `capital_movements` (Depósitos, aportaciones, retiros, créditos por reinversión)
6. `yield_entries` (Partidas de devengo, manuales, ajustes y contra-asientos de reversión; índice único por periodo activo)
7. `payment_records` (Pagos externos bancarios / SPEI registrados manualmente)
8. `payment_allocations` (Asignación exacta y pagos parciales a partidas de rendimiento)
9. `reinvestments` (Capitalización de rendimientos autorizada contractualmente)
10. `investment_documents` (Metadatos de documentos privados almacenados en R2)
11. `sessions` (Tokens seguros hash SHA-256 en cookies `HttpOnly; Secure; SameSite=Strict`)
12. `password_reset_tokens` (Tokens de recuperación de 1 solo uso con expiración de 1 hora)
13. `audit_logs` (Bitácora inmutable de eventos administrativos y financieros)
14. `notification_events` (Cola de correos sin exposición de saldos con control de reintentos)
15. `scheduled_job_runs` (Bitácora de ejecuciones del Cron Trigger con previsualizaciones)

---

## 3. Almacenamiento Privado de Documentos (Cloudflare R2)

- El bucket `portal-inversionistas-docs-private` **NO tiene habilitado acceso público**.
- Todos los documentos se descargan a través de la ruta autenticada `/api/investor/documents/:id/download`.
- El servidor verifica la titularidad del usuario antes de emitir el streaming del archivo.
- Cabeceras de protección activas: `Cache-Control: private, no-store, no-cache, must-revalidate`.
- Tipos de archivo permitidos: `application/pdf`, `image/png`, `image/jpeg`. Tamaño máximo: `15 MB`.

---

## 4. Cron Triggers y Trabajos Programados

Configurado en `wrangler.jsonc`:
```jsonc
"triggers": {
  "crons": ["0 6 * * *"] // Ejecución diaria a las 06:00 UTC
}
```
**Regla de Seguridad Financiera:**  
El Cron Trigger **ÚNICAMENTE genera previsualizaciones informativas y detecta vencimientos próximos**; **NUNCA** confirma devengos definitivos ni ejecuta movimientos monetarios sin la intervención y confirmación expresa del administrador en la interfaz.

---

## 5. Estrategia de Respaldos y Recuperación

1. **D1 Time Travel:** En plan Workers Paid, Cloudflare conserva automáticamente hasta 30 días de Time Travel para restauración a un punto en el tiempo específico:
   ```bash
   npx wrangler d1 time-travel restore portal-inversionistas-db --timestamp="2026-10-14T20:00:00Z"
   ```
2. **Respaldo Externo Independiente (Recomendado semanal):**
   ```bash
   npx wrangler d1 export portal-inversionistas-db --remote --output="backups/d1_backup_$(date +%Y%m%d).sql"
   ```
3. **Respaldo de Documentos R2:**
   Sincronización periódica mediante `rclone` o scripts Workers hacia almacenamiento secundario en frío.

---

## 6. Procedimiento de Rollback (Plan de Reversión)

Si se detecta una anomalía tras un despliegue:
1. **Reversión de Código:**
   ```bash
   # Desplegar la versión previa mediante Wrangler deployments
   npx wrangler rollback --env production
   ```
2. **Reversión Contable:**
   No modificar registros cerrados; utilizar el endpoint de contra-asiento auditado `POST /api/admin/yields/:id/reverse` especificando el motivo del ajuste.

---

## 7. Decisiones Contractuales Pendientes (Bloqueo Pre-Producción)

Antes de iniciar el cálculo masivo definitivo con fondos reales, se requiere la confirmación formal por escrito de las siguientes 7 decisiones:
1. **Definición de "A liquidación":** Confirmar si implica corte de rendimientos acumulados o liquidación total con retorno de capital.
2. **Regla de capitalización en reinversiones:** Fecha efectiva a partir de la cual el rendimiento reinvertido genera nuevo interés compuesto.
3. **Convención oficial de días:** Ratificación entre `ACT_365` (año civil exacto), `ACT_360` (año comercial bancario) o `30/360`.
4. **Fechas de corte de periodos:** Aniversario del día de inicio vs. día fijo de mes (ej. día 1 o 15).
5. **Catálogo de eventos de notificación:** Validar lista de correos que el cliente autoriza enviar automáticamente.
6. **Migración de histórico:** Formato acordado para cargar inversiones y saldos previos de los 15 clientes.
7. **Identidad corporativa:** Aprobación de logo oficial, paleta y subdominio final.
