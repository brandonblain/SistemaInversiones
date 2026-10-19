# Contrato de API — Portal Privado de Inversionistas (Verticimax)

**Versión:** 1.2.0 · **Monedas:** MXN y USD · **Huso contractual:** `America/Mexico_City`
**Implementación:** `src/worker/routes/*` · **Consumidor:** `web/src/api/http.ts`

Cambios en 1.2.0:
- **Moneda por inversión** (`currency`: `MXN` o `USD`). Los importes van en centavos de esa moneda. Pesos y dólares **nunca se suman**: los resúmenes vienen agrupados en `by_currency`.
- **Inversión a CETES** (`investment_type: "CETES"`, solo en MXN):
  - `rate_type: "REFERENCE"`, con `reference_rate_code` (`CETES_28|CETES_91|CETES_182|CETES_364`) y `spread_bps` (−100 = −1 punto).
  - **Tasa aplicada** = la última tasa capturada con fecha menor o igual al inicio del periodo, más el diferencial.
  - Las tasas las captura la administración en `/api/admin/reference-rates`.
- **Modalidad de cobro `ANNUAL`**: periodos de 12 meses anclados al inicio del contrato.
- **Breaking:** `GET /api/investor/summary` y `GET /api/admin/summary` cambian de forma (ver secciones 3 y 4).

Cambios respecto a 1.0.0-draft:
- **Nuevos campos:** ramo de inversión (`investment_type`) y beneficiarios.
- **Documentos:** ahora son exclusivos de la administración; se eliminaron las rutas de documentos del inversionista.
- **Endpoints que pidió el frontend:**
  - Inversionista: serie de la gráfica y avisos.
  - Administración: resumen, partidas, pagos, documentos y avisos.
- **Formatos fijados:**
  - el saldo desglosado (`balance`) en snake_case;
  - el historial unificado con el total real de registros;
  - los códigos de error estables.

---

## 1. Convenciones

| Tema | Regla |
|---|---|
| Importes | Enteros en **centavos de la moneda de la inversión** (`*_cents`). Un importe con decimales se rechaza con 400. Nunca se mezclan monedas. |
| Tasas | Enteros en **puntos básicos**: `1400` = 14.00 % anual. Porcentajes de beneficiario: `5000` = 50.00 %. |
| Fechas contractuales | `YYYY-MM-DD`, sin hora. Los periodos son `[period_start, period_end)`: incluyen el inicio y excluyen el fin. |
| Marcas de tiempo | ISO 8601 en UTC (`…Z`), o el formato de SQLite `YYYY-MM-DD HH:MM:SS` en UTC. `paid_at` acepta cualquier zona y se guarda en UTC. |
| Éxito | `{ "success": true, "data": … }` |
| Lista paginada | `{ "success": true, "data": [...], "pagination": { "page", "pageSize", "total", "totalPages" } }`. Parámetros `?page=1&pageSize=20`; el máximo de `pageSize` es 50 (100 en la bitácora). |
| Error | `{ "success": false, "error": { "code": "CODIGO", "message": "Texto en español", "details": … } }`. **Todos** los errores, incluidos 404 y 500, responden JSON. |
| Sesión | Cookie `auth_session` con `HttpOnly; Secure; SameSite=Strict`. Dura 12 h para administración y 7 días para inversionistas. El token **no** viaja en el cuerpo de la respuesta salvo con `ENVIRONMENT` test/development. |
| CSRF | Las escrituras que traen `Origin` deben venir de `APP_BASE_URL` (o de `ALLOWED_ORIGINS`); si no, responden 403 `CSRF_REJECTED`. |
| Caché | Todas las respuestas llevan `Cache-Control: private, no-store`. |

### Códigos de error frecuentes

| HTTP | Código | Cuándo |
|---|---|---|
| 400 | `INVALID_INPUT`, `WEAK_PASSWORD`, `INVALID_BENEFICIARIES`, `INVALID_PERIOD`, `PERIOD_OUTSIDE_CONTRACT`, `PAYMENT_IN_FUTURE`, `ALLOCATION_EXCEEDS_PAYMENT`, `INVALID_OR_EXPIRED_TOKEN` | La entrada no es válida (`details.field` indica el campo, cuando aplica). |
| 401 | `UNAUTHORIZED`, `SESSION_EXPIRED`, `INVALID_CREDENTIALS`, `MFA_REQUIRED`, `MFA_INVALID` | Falta sesión o credenciales. |
| 403 | `FORBIDDEN`, `ACCOUNT_INACTIVE`, `MFA_SETUP_REQUIRED`, `CSRF_REJECTED` | Sin permiso. |
| 404 | `NOT_FOUND` | No existe **o no pertenece al usuario** (no se revela la diferencia). |
| 409 | `YIELD_PERIOD_OVERLAP`, `PREVIEW_MISMATCH`, `PERIOD_CROSSES_CAPITAL_CHANGE`, `PERIOD_CROSSES_TERMS_CHANGE`, `ALLOCATION_EXCEEDS_PENDING`, `DUPLICATE_PAYMENT_REFERENCE`, `YIELD_HAS_SETTLEMENTS`, `ALREADY_REVERSED`, `REINVEST_NOT_ALLOWED`, `REINVEST_YIELD_NOT_ELIGIBLE`, `CAPITAL_CHANGE_IN_CLOSED_PERIOD`, `EMAIL_ALREADY_EXISTS`, `CODE_ALREADY_EXISTS`, `MFA_ALREADY_ENABLED` | Choca con el estado actual. |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` | Documento mayor a 15 MB, o que no es un PDF, PNG o JPEG real (se revisa la firma del archivo). |
| 423 | `RULES_NOT_APPROVED` | En producción, si `FINANCIAL_RULES_APPROVED` no es `"true"`. |
| 429 | `TOO_MANY_ATTEMPTS` | 5 fallos por correo, o 30 por IP, en 15 minutos. |

---

## 2. Autenticación (`/api/auth`)

| Método | Ruta | Cuerpo | Respuesta `data` |
|---|---|---|---|
| POST | `/login` | `{ email, password, mfa_token? }` | `{ user, investor_profile }`; además fija la cookie |
| POST | `/logout` | — | `{ message }` |
| GET | `/me` | — | `{ user, investor_profile }` |
| POST | `/change-password` | `{ current_password, new_password }` | `{ message }`. Cierra las demás sesiones. |
| POST | `/request-password-reset` | `{ email }` | Respuesta constante. Envía un enlace `{APP_BASE_URL}/restablecer?token=…` que vence en 1 h y sirve una sola vez. |
| POST | `/reset-password` | `{ token, new_password }` | `{ message }`. Cierra todas las sesiones. |
| POST | `/admin/mfa/setup` | — | `{ secret, otpauth_url }`. Devuelve 409 si el MFA ya está activo. |
| POST | `/admin/mfa/verify` | `{ token }` | `{ message }` |

`user = { id, email, role: "ADMIN"|"INVESTOR", is_active, mfa_enabled, requires_mfa_setup }`
`investor_profile = { id, full_name, rfc, phone, address } | null`

**Contraseñas:** de 10 a 128 caracteres, con letras y números.

**MFA de administradores:**
- Toda ruta `/api/admin/*` exige MFA activo; si no lo está, responde 403 `MFA_SETUP_REQUIRED`.
- Solo se puede desactivar fuera de producción, con `REQUIRE_ADMIN_MFA="false"`.
- Un código TOTP no se acepta dos veces.

---

## 3. Inversionista (`/api/investor`) — solo rol INVESTOR y solo sus datos

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/summary` | `{ by_currency: [{ currency, total_capital_cents, total_yield_generated_cents, total_yield_confirmed_cents, total_yield_paid_cents, total_yield_reinvested_cents, total_yield_pending_cents, active_investments_count }], active_investments_count, as_of_date }`. MXN aparece primero. |
| GET | `/investments?status=&page=&pageSize=` | Lista paginada de `InvestmentListItem` |
| GET | `/investments/:id` | `{ investment: InvestmentDetail, balance: Balance, current_reference_rate: { rate_code, annual_rate_bps, effective_date, applied_rate_bps } \| null }` |
| GET | `/investments/:id/history?type=ALL\|YIELDS\|PAYMENTS\|CAPITAL&page=&pageSize=` | Lista paginada de `HistoryEntry` |
| GET | `/investments/:id/series` | `{ as_of_date, capital_points: [{ date, capital_cents }], yield_periods: [{ period_start, period_end, confirmed_cents, paid_cents, reinvested_cents, pending_cents }] }` |
| GET | `/notifications?page=&pageSize=` | Lista paginada de `{ id, event_type, subject, status, created_at }`, sin el cuerpo del correo |

El inversionista **no tiene rutas de documentos**.

**Cómo se calcula el resumen (`/summary`):**
- `total_capital_cents` suma el capital de las inversiones **vigentes**.
- Los rendimientos suman **todas** las inversiones, también las vencidas.

```jsonc
// InvestmentListItem
{ "id", "code", "investment_type": "FAST_FOOD|MOBILITY|TRANSPORT|CETES", "status": "DRAFT|ACTIVE|MATURED|CANCELLED",
  "currency": "MXN|USD", "start_date", "maturity_date", "current_capital_cents",
  "terms": { "rate_type": "FIXED|REFERENCE",
             "fixed_annual_rate_bps",                 // FIXED; null en REFERENCE
             "reference_rate_code", "spread_bps",     // REFERENCE (CETES); null en FIXED
             "payout_frequency": "MONTHLY|SEMIANNUAL|ANNUAL|AT_MATURITY",
             "day_count_convention": "ACT_365|ACT_360|THIRTY_360", "capitalization_policy": "NONE|COMPOUND_TO_CAPITAL" },
  "stats": { "yield_confirmed_cents", "yield_paid_cents", "yield_reinvested_cents", "yield_pending_cents" } }

// InvestmentDetail = campos de lista + initial_capital_cents (sin "stats")
// Balance (sin doble conteo)
{ "capital_cents", "yield_generated_cents", "yield_confirmed_cents", "yield_paid_cents", "yield_reinvested_cents", "yield_pending_cents" }

// HistoryEntry
{ "entry_type": "YIELD|PAYMENT|CAPITAL", "id", "effective_date",          // fecha en CDMX
  "amount_cents", "status", "note",
  // YIELD:   period_start, period_end, source, paid_amount_cents, pending_amount_cents
  // PAYMENT: reference
}
```

**Definiciones del saldo:**
- **confirmado:** suma de las partidas confirmadas, incluidos los ajustes.
- **generado:** igual al confirmado (no se guardan borradores).
- **pagado:** suma de las asignaciones de pagos confirmados.
- **reinvertido:** suma de las reinversiones confirmadas.
- **pendiente:** `max(0, confirmado − pagado − reinvertido)`.

---

## 4. Administración (`/api/admin`) — rol ADMIN y MFA activo

### Resumen
- `GET /summary` → `{ investors_count, active_investments_count, by_currency: [{ currency, total_capital_cents, yield_pending_cents, active_investments_count }], reference_rates: [{ rate_code, annual_rate_bps, effective_date }], maturing_soon_count, notifications_failed_count, as_of_date }`

### Inversionistas
- `GET /investors?q=&active=1|0&page=&pageSize=`: `q` busca por nombre o correo. Cada fila trae `{ id, email, is_active, created_at, profile_id, full_name, rfc, phone, address, investments_count }`.
- `POST /investors`: cuerpo `{ email, password, full_name, rfc?, phone?, address?, notes?, beneficiaries?: [{ full_name, relationship: "SPOUSE|CHILD|PARENT|SIBLING|OTHER", percentage_bps }] }`.
  - Si hay beneficiarios, los porcentajes deben sumar **exactamente 10000**; si no, responde `INVALID_BENEFICIARIES`. El alta es atómica.
  - Responde 201 con `{ user_id, profile_id, email, full_name }`.
- `GET /investors/:id` → `{ user: { id, email, is_active, created_at }, profile, beneficiaries: [...], investments: InvestmentListItem[] }`

### Estadísticas
- `GET /statistics?investor_id=`: sin `investor_id` son generales; con `investor_id`, de ese cliente (404 si no existe). Todo va separado por moneda. Responde:
  - `totals`: por moneda, `{ currency, investors_count, investments_active, investments_matured, investments_total, initial_capital_cents, capital_cents, yield_confirmed_cents, yield_paid_cents, yield_reinvested_cents, yield_pending_cents, weighted_fixed_rate_bps }`. La tasa ponderada usa el capital vigente de las inversiones de tasa fija.
  - `by_type`: `{ currency, investment_type, investments_count, capital_cents, yield_confirmed_cents }`.
  - `by_payout`: `{ currency, payout_frequency, investments_count, capital_cents }`.
  - `monthly`: 12 meses por moneda, `{ currency, month: 'YYYY-MM', yield_confirmed_cents, paid_cents }`.
  - `upcoming_maturities`: vencimientos de los próximos 90 días.
  - `investors`: un renglón por cliente y moneda, `{ user_id, full_name, email, currency, investments_count, active_count, capital_cents, yield_confirmed_cents, yield_paid_cents, yield_reinvested_cents, yield_pending_cents, next_maturity }`.

### Inversiones
- `GET /investments?q=&status=&currency=&investment_type=&investor_id=&page=&pageSize=`: `q` busca por código, nombre o correo. Cada fila incluye además los saldos `yield_confirmed_cents`, `yield_paid_cents`, `yield_reinvested_cents` y `yield_pending_cents`. Cada fila trae `{ id, investor_user_id, code, investment_type, status, currency, start_date, maturity_date, initial_capital_cents, current_capital_cents, investor_name, investor_email, fixed_annual_rate_bps, payout_frequency, day_count_convention, capitalization_policy }`.
- `POST /investments`: cuerpo `{ investor_user_id, code, investment_type, currency, start_date, maturity_date, capital_cents, payout_frequency, day_count_convention, capitalization_policy, notes? }` más la tasa:
  - **tasa fija** (Fast Food, Movilidad, Transporte): `fixed_annual_rate_bps`;
  - **CETES**: `reference_rate_code` y `spread_bps`, con `currency` obligatoriamente `MXN`.
  - **Todos son obligatorios** (no se suponen convenciones).
  - Crea en una sola operación la inversión, sus términos, el capital inicial y la auditoría.
  - Responde 201 con `{ investment_id, code, current_capital_cents }`.
- `GET /investments/:id` → `{ investment: InvestmentDetail + { investor_user_id, investor_name, notes }, balance }`
- `GET /investments/:id/yields?pending=1` → `[{ id, investment_id, period_start, period_end, amount_cents, status, source: "AUTO|MANUAL|ADJUSTMENT|REVERSAL", paid_cents, reinvested_cents, pending_cents, note, created_at }]`

### Tasas de referencia (CETES)
- `GET /reference-rates?rate_code=&page=&pageSize=`: cada fila trae `{ id, rate_code, effective_date, annual_rate_bps, source, created_at, created_by, in_use }`.
- `POST /reference-rates`: cuerpo `{ rate_code, effective_date (no futura), annual_rate_bps, source? }`. Responde 201; si ya existe esa fecha para ese plazo, 409 `REFERENCE_RATE_EXISTS`.
- `DELETE /reference-rates/:id`: solo si ningún rendimiento la usó; si no, responde 409 `REFERENCE_RATE_IN_USE`.

### Rendimientos
- `POST /yields/preview`: cuerpo `{ investment_id, period_start, period_end }`. **No guarda nada.**
  - Responde `{ investment_id, period_start, period_end, days_in_period, capital_cents, annual_rate_bps (aplicada), calculated_yield_cents, day_count_convention, calculation_formula, calculation_version, currency, rate_type, reference_rate_code, reference_rate_bps, reference_rate_date, spread_bps, rules_approved }`.
  - En CETES, si no hay tasa capturada con fecha menor o igual al inicio del periodo, responde 409 `REFERENCE_RATE_MISSING`.
  - Cada rendimiento confirmado guarda la tasa usada (`reference_rate_id`), y esa tasa queda bloqueada.
  - El capital y la tasa son los **vigentes al inicio del periodo**.
  - Si el capital o los términos cambian dentro del periodo, responde 409 y `details.split_at` indica la fecha en que debe dividirse.
- `POST /yields/confirm`: cuerpo `{ investment_id, period_start, period_end, amount_cents?, note? }`.
  - **Recalcular:** el servidor vuelve a calcular. Si `amount_cents` (lo que vio el administrador) no coincide, responde 409 `PREVIEW_MISMATCH`.
  - **Idempotencia:** si el mismo periodo ya está confirmado, responde 200 con `is_existing: true`.
  - **Traslape:** si el periodo se traslapa con otro confirmado, responde 409 `YIELD_PERIOD_OVERLAP`.
  - **Éxito:** responde 201 con `{ yield_entry_id, is_existing, amount_cents }`.
- `POST /yields/manual`: cuerpo `{ investment_id, period_start, period_end, amount_cents (≠0; negativo = ajuste), reason (5 caracteres o más) }`. Responde 201.
- `POST /yields/:id/reverse`: cuerpo `{ reason }`. Crea un contra-asiento y responde 201 con `{ reversal_entry_id }`. Si la partida tiene pagos o reinversión, responde 409.

### Pagos externos (el portal no mueve dinero)
- `GET /payments?investment_id=&page=&pageSize=`: cada fila trae `{ id, investment_id, investment_code, currency, investor_name, amount_cents, allocated_cents, paid_at, status, reference, notes }`.
- `POST /payments`: cuerpo `{ investment_id, amount_cents, paid_at (ISO con zona, no futura), reference (única por inversión), notes?, allocations: [{ yield_entry_id, amount_cents }] }`.
  - La suma asignada debe ser menor o igual al monto del pago.
  - Cada asignación debe ser menor o igual al saldo pendiente de su partida. Lo garantiza la base de datos, aun con peticiones simultáneas.
  - Avisa al inversionista **sin montos**.
- `POST /investments/:id/reinvest`: cuerpo `{ yield_entry_id, effective_date, notes? }`.
  - Solo procede si el contrato es `COMPOUND_TO_CAPITAL`.
  - Reinvierte la partida completa y sin pagos.
  - `effective_date` debe ser posterior o igual al `period_end` de la partida, y no puede caer dentro de un periodo ya confirmado.
  - Responde 201 con `{ reinvestment_id, capital_movement_id, new_capital_cents }`.

### Documentos (solo administración)
- `GET /documents?investment_id=&page=&pageSize=`: cada fila trae `{ id, investment_id, investment_code, title, document_type, original_filename, size_bytes, content_type, created_at }`.
- `POST /investments/:id/documents`: `multipart/form-data` con `file`, `title` y `document_type` (`CONTRACT|ADDENDUM|ACCOUNT_STATEMENT|TAX_RECEIPT|OTHER`).
  - Se valida la firma real del archivo (PDF, PNG o JPEG), con un máximo de 15 MB.
  - Responde 201 con `{ id, size_bytes, content_type }`.
- `GET /documents/:id/download`: descarga desde R2 privado con `Content-Disposition: attachment; filename*=UTF-8''…` y `no-store`.
- `DELETE /documents/:id`: **archiva** el documento (el archivo se conserva para auditoría).

### Avisos, bitácora y trabajos
- `GET /notifications?status=PENDING|SENT|FAILED&page=&pageSize=`: cada fila trae `{ id, user_id, investment_id, event_type, recipient_email, subject, status, attempts_count, error_message, created_at }`.
- `GET /audit-logs?action=&page=&pageSize=`: `action` filtra por texto parcial. Cada fila trae `{ id, user_id, actor_email, action, entity_type, entity_id, old_values_json, new_values_json, ip_address, created_at }`.
- `POST /jobs/run-maintenance` (también `/jobs/run-preview`): ejecuta el mismo trabajo que el Cron. Solo genera vistas previas y avisos; nunca confirma rendimientos.

---

## 5. Decisiones contractuales pendientes (no implementadas como definitivas)

El motor recibe estas convenciones como parámetros explícitos y deja la versión de cálculo en cada partida:
- tasa nominal frente a efectiva, base de días y redondeo;
- fecha de corte por aniversario o por día fijo de calendario (hoy se ancla al aniversario del inicio del contrato);
- qué significa "a liquidación";
- **CETES:** el plazo (28, 91, 182 o 364 días); la fecha de observación (hoy: la tasa vigente al inicio de cada periodo); y si "−1 punto" son 100 puntos básicos (hoy sí, y el diferencial es configurable por inversión);
- desde qué fecha capitaliza una reinversión (hoy la fija el administrador en `effective_date`).

En producción, la confirmación de rendimientos queda bloqueada (423) hasta poner `FINANCIAL_RULES_APPROVED="true"` con la aprobación escrita del cliente.
