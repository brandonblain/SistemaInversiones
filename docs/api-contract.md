# Contrato de API y Datos — Portal Privado de Inversionistas (Cloudflare v2.0)

**Versión:** 1.0.0-draft  
**Autor:** Codex (Backend)  
**Destinatarios:** Claude (Frontend), Integración y Pruebas  
**Moneda oficial:** `MXN` (Pesos Mexicanos)  
**Huso horario contractual:** `America/Mexico_City` (Las fechas operativas se interpretan en este huso; las fechas ISO de auditoría se emiten en UTC con sufijo `Z`).  

---

## 1. Principios de diseño financiero y de transporte

1. **Aritmética entera exacta:** Todos los importes monetarios se transmiten en **centavos enteros** (`amount_cents`). Ejemplo: `$150,000.50 MXN` = `15000050`. Queda estrictamente prohibido el envío o procesamiento de montos en tipo `number` flotante.
2. **Tasas expresadas en unidades fijas:** Las tasas anuales fijas se transmiten en puntos básicos o diezmilésimos (`fixed_annual_rate_bps`, donde `1200` = `12.00%` anual = `0.12`).
3. **Parámetros contractuales explícitos:**
   - `day_count_convention`: `"ACT_365"` | `"ACT_360"` | `"THIRTY_360"`.
   - `payout_frequency`: `"MONTHLY"` | `"SEMIANNUAL"` | `"AT_MATURITY"`.
   - `capitalization_policy`: `"NONE"` (sin capitalización / pago a cuenta) | `"COMPOUND_TO_CAPITAL"` (incrementa capital base si el contrato lo estipula).
4. **Respuestas uniformes:**
   - Éxito: `{ "success": true, "data": ... }`
   - Paginación: `{ "success": true, "data": [...], "pagination": { "page": 1, "pageSize": 20, "total": 15, "totalPages": 1 } }`
   - Error: `{ "success": false, "error": { "code": "STRING_CODE", "message": "Mensaje legible", "details": null } }`
5. **Seguridad y privacidad:**
   - Sesión en cookie `HttpOnly; Secure; SameSite=Strict`.
   - Header de autorización Bearer opcional para pruebas.
   - Headers `Cache-Control: private, no-store, no-cache, must-revalidate` en todas las respuestas de datos financieros y documentos.
   - Prohibido servir R2 públicamente.

---

## 2. Autenticación y Perfil (`/api/auth`)

### `POST /api/auth/login`
Inicia sesión con credenciales. Para administradores con MFA configurado, se requiere `mfa_token` (código TOTP de 6 dígitos).

- **Request Body:**
```json
{
  "email": "inversionista@ejemplo.com",
  "password": "Password123!",
  "mfa_token": "123456" // Requerido solo para ADMIN con MFA activo
}
```
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "usr_01HXYZ...",
      "email": "inversionista@ejemplo.com",
      "role": "INVESTOR", // "ADMIN" | "INVESTOR"
      "is_active": true,
      "requires_mfa": false
    },
    "investor_profile": {
      "id": "inv_01HXYZ...",
      "full_name": "Juan Pérez",
      "rfc": "PEAJ800101XYZ",
      "phone": "+525500000000"
    }
  }
}
```
- **Errores:**
  - `401 INVALID_CREDENTIALS`: Correo o contraseña incorrectos.
  - `401 MFA_REQUIRED`: Se requiere `mfa_token` para completar el acceso de administrador.
  - `401 MFA_INVALID`: Código TOTP inválido o expirado.
  - `403 ACCOUNT_INACTIVE`: Cuenta deshabilitada por el administrador.

### `POST /api/auth/logout`
Destruye la sesión activa y elimina cookies.
- **Response `200 OK`:** `{ "success": true, "data": { "message": "Sesión cerrada correctamente." } }`

### `GET /api/auth/me`
Retorna el usuario y perfil actualmente autenticados.
- **Response `200 OK`:** `{ "success": true, "data": { "user": ..., "investor_profile": ... } }`

### `POST /api/auth/change-password`
Permite al usuario cambiar su propia contraseña.
- **Request Body:**
```json
{
  "current_password": "Password123!",
  "new_password": "NewSecurePassword456!"
}
```
- **Response `200 OK`:** `{ "success": true, "data": { "message": "Contraseña actualizada exitosamente." } }`

### `POST /api/auth/request-password-reset`
Solicita token de recuperación enviado por correo electrónico.
- **Request Body:** `{ "email": "inversionista@ejemplo.com" }`
- **Response `200 OK`:** `{ "success": true, "data": { "message": "Si el correo está registrado, se ha enviado un enlace de recuperación." } }`

### `POST /api/auth/reset-password`
Aplica el restablecimiento con token seguro de recuperación.
- **Request Body:** `{ "token": "rst_01HXYZ...", "new_password": "NewSecurePassword456!" }`
- **Response `200 OK`:** `{ "success": true, "data": { "message": "Contraseña restablecida exitosamente." } }`

---

## 3. Portal de Inversionista (`/api/investor`)
*Rutas protegidas con rol `INVESTOR` o `ADMIN` en modo suplantación autorizada.*

### `GET /api/investor/summary`
Retorna el balance financiero consolidado del inversionista autenticado (suma de todas sus inversiones activas e históricas).
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": {
    "currency": "MXN",
    "total_capital_cents": 100000000,
    "total_yield_generated_cents": 1200000,
    "total_yield_confirmed_cents": 1200000,
    "total_yield_paid_cents": 800000,
    "total_yield_reinvested_cents": 0,
    "total_yield_pending_cents": 400000,
    "active_investments_count": 2,
    "as_of_date": "2026-10-15"
  }
}
```

### `GET /api/investor/investments`
Lista paginada de las inversiones asociadas al inversionista autenticado.
- **Query Params:** `page=1&pageSize=10&status=ACTIVE`
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "inv_01",
      "code": "INV-2026-001",
      "status": "ACTIVE", // "DRAFT" | "ACTIVE" | "MATURED" | "CANCELLED"
      "currency": "MXN",
      "start_date": "2026-01-15",
      "maturity_date": "2027-01-15",
      "current_capital_cents": 50000000,
      "terms": {
        "fixed_annual_rate_bps": 1400, // 14.00%
        "payout_frequency": "MONTHLY", // "MONTHLY" | "SEMIANNUAL" | "AT_MATURITY"
        "day_count_convention": "ACT_365",
        "capitalization_policy": "NONE"
      },
      "stats": {
        "yield_confirmed_cents": 700000,
        "yield_paid_cents": 700000,
        "yield_pending_cents": 0
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 10, "total": 1, "totalPages": 1 }
}
```

### `GET /api/investor/investments/:id`
Detalle completo de una inversión del inversionista autenticado.
- **Response `200 OK`:** Retorna la inversión, términos contractuales vigentes y saldo desglosado.

### `GET /api/investor/investments/:id/history`
Historial de rendimientos devengados/confirmados y pagos externos asignados.
- **Query Params:** `page=1&pageSize=20&type=ALL` (`ALL` | `YIELDS` | `PAYMENTS` | `CAPITAL`)
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "entry_type": "YIELD",
      "id": "yid_01",
      "effective_date": "2026-02-15",
      "period_start": "2026-01-15",
      "period_end": "2026-02-15",
      "amount_cents": 583333,
      "status": "CONFIRMED",
      "paid_amount_cents": 583333,
      "pending_amount_cents": 0,
      "note": "Rendimiento devengado mensual enero-febrero"
    },
    {
      "entry_type": "PAYMENT",
      "id": "pay_01",
      "effective_date": "2026-02-16",
      "amount_cents": 583333,
      "status": "CONFIRMED",
      "reference": "SPEI-BBVA-839201",
      "note": "Transferencia bancaria externa liquidando periodo 1"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "total": 2, "totalPages": 1 }
}
```

### `GET /api/investor/investments/:id/documents`
Lista de documentos y contratos disponibles para el inversionista.
- **Response `200 OK`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "doc_01",
      "title": "Contrato Marco de Inversión 2026-001",
      "document_type": "CONTRACT",
      "original_filename": "Contrato_Marco_Firmado.pdf",
      "size_bytes": 1048576,
      "created_at": "2026-01-15T10:00:00Z"
    }
  ]
}
```

### `GET /api/investor/documents/:id/download`
Descarga privada autenticada en streaming directo desde Cloudflare R2 con headers `private, no-store`.

---

## 4. Gestión Administrativa (`/api/admin`)
*Rutas protegidas estrictamente con rol `ADMIN`.*

### Inversionistas
- `GET /api/admin/investors`: Lista inversionistas con filtros y paginación.
- `POST /api/admin/investors`: Crea cuenta de usuario y perfil de inversionista.
- `GET /api/admin/investors/:id`: Detalle completo y lista de inversiones vinculadas.

### Inversiones
- `GET /api/admin/investments`: Lista general de contratos/inversiones.
- `POST /api/admin/investments`: Da de alta un contrato con capital inicial, términos financieros y políticas.
- `GET /api/admin/investments/:id`: Detalle administrativo y balance completo.

### Motor Financiero y Liquidación
- `POST /api/admin/yields/preview`:
  Calcula y devuelve la previsualización determinista del rendimiento de una inversión para un periodo específico, **sin persistir cambios** en la base de datos.
  - **Request Body:**
  ```json
  {
    "investment_id": "inv_01",
    "period_start": "2026-02-15",
    "period_end": "2026-03-15",
    "day_count_convention": "ACT_365" // Opcional, hereda de los términos si se omite
  }
  ```
  - **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "investment_id": "inv_01",
      "period_start": "2026-02-15",
      "period_end": "2026-03-15",
      "days_in_period": 28,
      "capital_cents": 50000000,
      "annual_rate_bps": 1400,
      "calculated_yield_cents": 536986,
      "day_count_convention": "ACT_365",
      "calculation_formula": "50000000 * (1400 / 10000) * (28 / 365)"
    }
  }
  ```

- `POST /api/admin/yields/confirm`:
  Genera o confirma un rendimiento devengado de forma idempotente con bloqueo de periodo duplicado.
  - **Request Body:**
  ```json
  {
    "investment_id": "inv_01",
    "period_start": "2026-02-15",
    "period_end": "2026-03-15",
    "amount_cents": 536986,
    "note": "Rendimiento devengado mensual ordinario"
  }
  ```

- `POST /api/admin/yields/manual`:
  Registra un rendimiento manual o ajuste extraordinario con motivo obligatorio y firma de auditoría.

- `POST /api/admin/yields/:id/reverse`:
  Genera un contra-asiento de reversión auditado sin eliminar físicamente el registro original.

- `POST /api/admin/payments`:
  Registra un pago externo realizado al inversionista (ej. SPEI bancario) y asigna el monto parcial o total a las partidas de rendimiento pendientes (`payment_allocations`).
  - **Request Body:**
  ```json
  {
    "investment_id": "inv_01",
    "amount_cents": 536986,
    "paid_at": "2026-03-16T14:30:00Z",
    "reference": "SPEI-BBVA-908123",
    "notes": "Comprobante bancario 908123 verificado",
    "allocations": [
      {
        "yield_entry_id": "yid_02",
        "amount_cents": 536986
      }
    ]
  }
  ```

- `POST /api/admin/investments/:id/reinvest`:
  Registra la reinversión de un rendimiento confirmado hacia el capital de la inversión (siempre que el contrato lo autorice), creando un movimiento de capital y cerrando el saldo pendiente del rendimiento.

### Documentos Privados R2
- `POST /api/admin/investments/:id/documents`: Sube un archivo a R2 previa validación de tipo MIME (`application/pdf`, `image/png`, `image/jpeg`) y tamaño máximo (15 MB).
- `DELETE /api/admin/documents/:id`: Archiva o elimina el documento y su registro en base de datos.

### Auditoría y Trabajos
- `GET /api/admin/audit-logs`: Bitácora inmutable de eventos administrativos y financieros con paginación y filtros.
- `POST /api/admin/jobs/run-preview`: Dispara manualmente el generador de previsualizaciones y avisos de vencimiento (emula la ejecución de Cron Triggers).
