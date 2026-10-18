# Frontend — integraciones pendientes

**Rama:** `feature/frontend-portal` · **Carpeta:** `web/` · **Contrato base:** `docs/api-contract.md` v1.0.0-draft

La interfaz está completa y funciona con datos FICTICIOS (`npm run dev:mock`). Este documento lista lo que falta para conectarla a la API real. La lista de endpoints está en `web/src/api/http.ts`; las rutas que todavía no existen en el contrato están marcadas con `// PROPUESTO`.

## 1. Endpoints que usa la UI y que el contrato aún no define

Se proponen estas formas, implementadas tal cual en el mock (`web/src/api/mock/mock-api.ts`). El backend puede cambiar nombres; solo hay que avisar para ajustar `http.ts`.

| Pantalla | Método y ruta propuesta | Respuesta esperada |
|---|---|---|
| Inversionista › Detalle › Evolución | `GET /api/investor/investments/:id/series` | `{ as_of_date, capital_points: [{date, capital_cents}], yield_periods: [{period_start, period_end, confirmed_cents, paid_cents, reinvested_cents, pending_cents}] }`. La gráfica no calcula nada: necesita la serie ya calculada. |
| Inversionista › Avisos | `GET /api/investor/notifications?page&pageSize` | Paginado `{id, event_type, subject, status, created_at}`, sin cuerpo del correo. |
| Admin › Resumen | `GET /api/admin/summary` | `{investors_count, active_investments_count, total_capital_cents, yield_pending_cents, maturing_soon_count, notifications_failed_count, as_of_date}` |
| Admin › Rendimientos / Pagos / Detalle | `GET /api/admin/investments/:id/yields?pending=1` | Arreglo de partidas `{id, period_start, period_end, amount_cents, status, source, paid_cents, reinvested_cents, pending_cents, note, created_at}`. **Es indispensable para asignar pagos**: sin él, el administrador no puede elegir qué rendimiento liquida un pago. |
| Admin › Pagos (historial) | `GET /api/admin/payments?investment_id&page&pageSize` | Paginado `{id, investment_id, investment_code, investor_name, amount_cents, allocated_cents, paid_at, status, reference, notes}` |
| Admin › Documentos (lista) | `GET /api/admin/documents?investment_id&page&pageSize` | Paginado `{id, investment_id, investment_code, title, document_type, original_filename, size_bytes, content_type, created_at}`. |
| Admin › Documentos (descarga) | `GET /api/admin/documents/:id/download` | Archivo en streaming desde R2 con `Content-Disposition: attachment; filename*=UTF-8''<nombre>` y `Cache-Control: private, no-store`. |
| Admin › Avisos | `GET /api/admin/notifications?status&page&pageSize` | Paginado con `recipient_email`, `attempts_count` y `error_message`. |

## 2. Campos nuevos solicitados por el cliente (contrato y migraciones)

Aún no están en `docs/api-contract.md` ni en `migrations/`. La UI y el mock ya los usan.

1. **Documentos solo para administración.** El inversionista ya no tiene sección, pestaña ni avisos de documentos. Se proponen estos cambios en el backend:
   - Retirar o bloquear para el rol INVESTOR `GET /api/investor/investments/:id/documents` y `GET /api/investor/documents/:id/download`.
   - Dejar de generar el aviso por correo `DOCUMENT_UPLOADED` al inversionista.
   - Mover la descarga a `GET /api/admin/documents/:id/download`.
2. **Tipo de inversión (ramo).** Campo `investment_type: "FAST_FOOD" | "MOBILITY" | "TRANSPORT"`:
   - **Dónde:** en `POST /api/admin/investments` y en las respuestas de listas y detalle (inversionista y admin).
   - **Migración sugerida:** columna `investments.investment_type TEXT NOT NULL CHECK (investment_type IN ('FAST_FOOD','MOBILITY','TRANSPORT'))`.
   - **Condiciones de referencia del material comercial** (solo prellenan el formulario y se pueden editar): Movilidad $250,000 · 12 meses · 16 %; Transporte $400,000 · 18 meses · 25 %; Fast Food (Alimentos) $100,000 · 12 meses · 13 %.
3. **Beneficiarios del cliente.**
   - **Alta:** `POST /api/admin/investors` acepta `beneficiaries: [{ full_name, relationship, percentage_bps }]`.
   - **Consulta:** `GET /api/admin/investors/:id` los devuelve con `id`.
   - **Parentesco:** `relationship ∈ SPOUSE | CHILD | PARENT | SIBLING | OTHER`.
   - **Porcentaje:** `percentage_bps` es un entero donde 10000 = 100.00 %. Si hay beneficiarios, deben sumar exactamente 10000, y el servidor debe validarlo (la UI ya lo hace). La UI no envía beneficiarios vacíos.
   - **Migración sugerida:** tabla `investor_beneficiaries(id, investor_user_id, full_name, relationship, percentage_bps, created_at)` con `CHECK (percentage_bps > 0 AND percentage_bps <= 10000)`. La suma se valida en el servicio. Los cambios deben quedar en la bitácora.

## 3. Detalles del contrato que la UI necesita confirmar

1. **Detalle de inversión (`GET /api/investor/investments/:id` y `/api/admin/investments/:id`).** El contrato no fija los nombres del saldo desglosado. `normalizeInvestmentDetail()` en `http.ts` acepta `{ investment, summary }` con claves `capitalVigenteCents`, `rendimientoPagadoCents`, etc., o con snake_case (`yield_paid_cents`…). Se recomienda fijarlo en snake_case en el contrato. El detalle de admin también debe incluir `investor_user_id`, `investor_name` y `notes`.
2. **Login y `/me`.** El contrato muestra `requires_mfa` y la UI lee `user.mfa_enabled` para el aviso de "MFA obligatorio" del administrador. Hay que confirmar el nombre. Si la respuesta incluye un `token` en el cuerpo, la UI lo **descarta**: la sesión solo vive en la cookie HttpOnly.
3. **Historial (`/history`).** La UI usa `type=ALL|YIELDS|PAYMENTS|CAPITAL` y espera `pagination.total` real (no el tamaño de la página). Para rendimientos espera `paid_amount_cents` y `pending_amount_cents`; para pagos, `reference`.
4. **Filtros de listas.** La UI envía `q` (búsqueda por nombre, correo o código) y `status`/`active` en `/api/admin/investors` y `/api/admin/investments`, y `action` en `/api/admin/audit-logs`. Si el backend los ignora, la búsqueda no filtrará.
5. **Enlace de recuperación.** El correo debe apuntar a `{APP_BASE_URL}/restablecer?token=<token>`. La UI lee el token y lo quita de la barra de direcciones.
6. **Descarga de documentos.** Solo la usa la administración, con la ruta propuesta en la sección 1. El inversionista no consume ningún endpoint de documentos.
7. **`DELETE /api/admin/documents/:id`.** Está en el contrato y la UI lo usa como "Archivar".
8. **Errores.** La UI muestra `error.message` tal cual, así que debe venir en español y sin datos sensibles. Un 401 fuera de login cierra la sesión en memoria y regresa al login con aviso. Un 403 muestra "Sin acceso a esta información". Los errores no controlados deben responder JSON con el sobre `{ success:false, error }`, no texto plano.

## 4. Despliegue en Workers Static Assets (le corresponde a integración, no se modificó `wrangler.jsonc`)

```jsonc
// wrangler.jsonc (propuesta)
"assets": {
  "directory": "./web/dist",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*"]
}
```

- Compilar con `cd web && npm ci && npm run build`. Sin `VITE_USE_MOCKS=true`, el build **no incluye** datos ficticios (verificado: ninguna cadena "ficticio" en `dist/`).
- Las respuestas `/api/*` deben conservar `Cache-Control: private, no-store`. Los archivos de `web/dist/assets/*` llevan hash y se pueden cachear.
- Encabezados recomendados para el HTML: `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'`.

## 5. Pendientes del cliente que afectan la interfaz

- **Identidad aplicada: Verticimax México Star Up.** Plataforma en azul marino oscuro con tonalidades (`web/src/index.css`). El emblema y el logotipo están en `web/public/` y se extrajeron de la imagen enviada. Conviene pedir el logo en vector (SVG o PDF) para mejorar la nitidez del emblema sobre fondo azul marino.
- **Modalidades de cobro en el material comercial.** El material dice "Mensual, Fin del contrato, Reinversión CETES / Dólares", pero el alcance aprobado dice "mensual / semestral / a liquidación". La UI sigue el alcance aprobado hasta que el cliente lo confirme.
- **Significado de "A liquidación".** Hoy la etiqueta es "Al vencimiento (liquidación)" y el formulario muestra el aviso "pendiente de confirmar si incluye la devolución del capital".
- **Convención de días, fechas de corte y reglas de reinversión.** Aparecen como "pendiente de aprobación" en Admin › Rendimientos y en el detalle de inversión.
- **Catálogo de eventos de correo.** Las etiquetas están en `web/src/lib/labels.ts` (`notificationEventLabel`).

## 6. Antes de producción

- [ ] Quitar el modo mock del pipeline (no definir `VITE_USE_MOCKS`).
- [ ] Probar en staging cada pantalla contra la API real con datos ficticios.
- [ ] Verificar en dispositivo Android de gama media: carga inicial de unos 82 KB gzip; las gráficas (unos 108 KB gzip) se cargan solo al abrir "Evolución".
