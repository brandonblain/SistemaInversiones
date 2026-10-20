# Guía de despliegue y operación — Portal de inversionistas (Cloudflare Workers Paid)

Un solo Worker sirve la API (Hono, `/api/*`) y el frontend compilado (`web/dist`, Static Assets). Las piezas son:
- **D1:** datos.
- **R2 privado:** documentos.
- **Cron diario:** solo vistas previas y avisos.

## 1. Entornos y variables (`wrangler.jsonc`)

| Variable | Local | Staging | Producción | Uso |
|---|---|---|---|---|
| `ENVIRONMENT` | development | staging | production | Activa HSTS y las reglas estrictas de producción. |
| `APP_BASE_URL` | http://localhost:8787 | URL de staging | Subdominio del cliente | Enlaces en correos y verificación de `Origin` (CSRF). |
| `ALLOWED_ORIGINS` | http://localhost:5173 | vacío | vacío | Orígenes extra (servidor de Vite en desarrollo). |
| `EMAIL_PROVIDER` | log | log | resend | `log` no envía; en producción **falla** para no marcar como enviado algo que no salió. |
| `REQUIRE_ADMIN_MFA` | false | true | true | En producción el MFA siempre es obligatorio, sin importar esta variable. |
| `FINANCIAL_RULES_APPROVED` | false | false | **false** | Ponerla en `true` solo con la aprobación escrita de las convenciones; mientras tanto, producción no confirma rendimientos (423). |

Las variables **no se heredan** entre entornos: cada bloque `env.*` las define todas.

### Secretos (nunca en el repositorio)
```bash
npx wrangler secret put EMAIL_API_KEY --env production   # clave del proveedor de correo (Resend u otro compatible)
npx wrangler secret put EMAIL_API_KEY --env staging      # opcional, si staging debe enviar correos reales
npx wrangler secret put BANXICO_TOKEN --env production   # token de la API REST del SIE de Banxico (tasas CETES)
```
La versión anterior de esta guía pedía `JWT_SECRET` y `ADMIN_MFA_SECRET`, pero el código no los usa: las sesiones son tokens aleatorios guardados como hash en D1, y cada administrador tiene su propio secreto MFA.

### Tasas CETES desde Banxico (SIE)
1. Solicite el token (gratuito) en https://www.banxico.org.mx/SieAPIRest/service/v1/token y guárdelo como secreto `BANXICO_TOKEN`. El token nunca se envía al navegador ni se guarda en D1.
2. En **Administración › Tasas CETES › Importar desde Banxico**: *Consultar Banxico* muestra la vista previa (no escribe nada) e *Importar* guarda solo las tasas nuevas, con fuente `Banxico SIE <serie>` y registro en la bitácora. Nunca se sobrescribe una tasa ya capturada: si difiere, se reporta.
3. Series (subasta semanal, tasa de rendimiento): CETES 28 `SF43936`, 91 `SF43939`, 182 `SF43942`, 364 `SF43945` (`src/worker/services/banxico.ts`). Las cuatro se verificaron contra el catálogo del SIE (20/10/2026). Como salvaguarda, si el título que devuelve Banxico no menciona el plazo esperado, esa serie se rechaza.
4. Límites de Banxico: 200 consultas cada 5 minutos y 10 000 al día. Sin token, la importación responde 503 y la captura manual sigue disponible.
5. Indicadores en pantalla (`GET /api/public/market`, sin sesión): tipo de cambio FIX (`SF43718`) y CETES más recientes ("dato oportuno"). Se muestran en la página pública (fila CETES − 1 y tipo de cambio), en la cuenta del cliente y en el resumen de administración. Se guardan en la caché del Worker 30 minutos; si Banxico falla se sirve el último dato bueno (hasta 3 días). Son informativos: los rendimientos se calculan con las tasas importadas o capturadas, nunca con este dato en vivo. Es la única ruta `/api` que responde en el dominio público.

### Correo
1. Verifique el dominio remitente en el proveedor (SPF/DKIM). **No modifique los registros MX existentes del cliente.**
2. Ponga `EMAIL_FROM` con una dirección de ese dominio.
3. Los correos nunca incluyen montos: el servicio bloquea cualquier aviso con importes (`CONTENT_POLICY`).

## 2. Primer despliegue

```bash
# 0) Recursos (una vez por entorno)
npx wrangler d1 create portal-inversionistas-db-prod          # copiar database_id a wrangler.jsonc
npx wrangler r2 bucket create portal-inversionistas-docs-prod # bucket SIN acceso público

# 1) Frontend
cd web && npm ci && npm run build && cd ..                    # genera web/dist (sin datos ficticios)

# 2) Migraciones
npm run d1:migrate:prod                                       # 0001 + 0002

# 3) Primer administrador (luego activa MFA en Administración › Seguridad)
ADMIN_INITIAL_PASSWORD='...' npm run admin:sql -- admin@dominio.com "Nombre" > admin.sql
npx wrangler d1 execute DB --env production --remote --file=admin.sql && rm admin.sql

# 4) Despliegue
npm run deploy:production
```

**Staging con datos ficticios.** Son los mismos usuarios del modo de ejemplo del frontend: Héctor Galeana, Cesar Daniel y Victoria Pérez.
```bash
SEED_PASSWORD='...' npm run seed:sql > seed.sql
npx wrangler d1 execute DB --env staging --remote --file=seed.sql && rm seed.sql
```

**Desarrollo local:**
```bash
npm run d1:migrate:local
SEED_PASSWORD='...' npm run seed:sql > seed.sql && npx wrangler d1 execute DB --local --file=seed.sql
npm run dev              # API en :8787
cd web && npm run dev    # UI en :5173 con proxy a /api
```

**Dominio:** use un *Custom Domain* del Worker (HTTPS automático) sobre el subdominio que defina el cliente.

## 3. Seguridad implementada

- **Sesiones:** cookie `HttpOnly; Secure; SameSite=Strict`, con el token guardado como hash SHA-256. Se cierran las demás sesiones al cambiar la contraseña y todas al restablecerla.
- **Contraseñas:** PBKDF2-SHA256 con 100k iteraciones. El login tarda lo mismo exista o no el correo.
- **Bloqueo:** 5 fallos por correo o 30 por IP en 15 minutos.
- **Administradores:** MFA TOTP obligatorio y anti-reutilización (no se acepta el mismo código dos veces). El secreto activo no se puede sobrescribir.
- **Recuperación:** token de un solo uso que vence en 1 hora y solo existe en el correo.
- **CSRF:** SameSite=Strict, verificación de `Origin` y rechazo de `Sec-Fetch-Site: cross-site`.
- **Aislamiento:** toda consulta del inversionista filtra por `investor_user_id`. Lo ajeno responde 404.
- **Documentos:** solo administración, R2 sin acceso público, firma real del archivo, archivado (no borrado) y respuestas `no-store`.
- **Integridad en D1:** triggers para traslapes, saldos de asignación, reinversión y reversión; bitácora y movimientos de capital de solo inserción; referencia bancaria única por inversión.

### Restablecer el MFA de un administrador (pérdida de dispositivo)
1. Otro administrador verifica la identidad por un canal independiente.
2. Ejecutar:
   ```bash
   npx wrangler d1 execute DB --env production --remote --command "UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_pending_secret = NULL, mfa_last_counter = 0 WHERE email = 'admin@dominio.com'"
   npx wrangler d1 execute DB --env production --remote --command "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = 'admin@dominio.com')"
   ```
3. Registrar el evento en la bitácora operativa externa. El administrador vuelve a configurar MFA al entrar.

## 4. Trabajo programado

`0 6 * * *` (06:00 UTC = 00:00 en Ciudad de México):
1. Encola avisos de vencimiento a 30 días, uno por inversión cada 15 días.
2. Calcula **vistas previas** de los periodos terminados.
3. Procesa la cola de correos con reclamo atómico y hasta 3 intentos.

**Nunca** confirma rendimientos, pagos ni movimientos de capital. También se puede lanzar a mano con `POST /api/admin/jobs/run-maintenance`.

## 5. Respaldos y recuperación

1. **D1 Time Travel** (30 días en el plan Paid): `npx wrangler d1 time-travel restore portal-inversionistas-db-prod --env production --timestamp=<ISO>`.
2. **Exportación externa semanal**, independiente de Cloudflare: `npx wrangler d1 export portal-inversionistas-db-prod --env production --remote --output=backups/d1_$(date +%Y%m%d).sql`. Guárdela cifrada fuera de Cloudflare.
3. **R2:** sincronización periódica con `rclone` hacia almacenamiento secundario.
4. **Ensayo de restauración trimestral** en staging.

## 6. Reversión

- **Código:** `npx wrangler rollback --env production`.
- **Datos contables:** nunca se editan. Se corrigen con contra-asiento (`POST /api/admin/yields/:id/reverse`) o con un ajuste manual con motivo.

## 7. Pruebas

```bash
npm test                 # 56 pruebas (unitarias + integración con D1 simulado sobre SQLite)
npm run test:coverage
npm run typecheck
```

La cobertura actual es de 94.6 % de líneas y 68.8 % de ramas. Las pruebas cubren lo que pide `docs/02-reglas-financieras.md`:
- modalidades mensual, semestral y al vencimiento;
- pagos parciales y completos;
- capitalización;
- años bisiestos;
- doble clic y concurrencia;
- reversiones;
- aislamiento entre clientes;
- documentos.

Se validó además con `wrangler dev` sobre el motor D1 real: migraciones, triggers y el flujo completo de login → vista previa → confirmar → pagar.
