# Verticimax México Star Up — Portal privado de inversionistas

Un solo proyecto para Cloudflare Workers:

| Parte | Ubicación | Tecnología |
|---|---|---|
| API y motor financiero | `src/worker/` | Hono + D1 (SQLite) + R2 privado |
| Interfaz | `web/` | React + Vite + Tailwind (se publica como *Static Assets*) |
| Base de datos | `migrations/` | Migraciones D1 versionadas |

## Probarlo en local (backend + frontend juntos)

Requisitos: Node 20 o superior.

```bash
npm run setup     # instala dependencias, crea la base D1 local y carga los datos FICTICIOS
npm start         # compila la interfaz y levanta todo en http://localhost:8787
```

Abra **http://localhost:8787**: verá la **página web pública** de la empresa (ramos, opciones de inversión, formas de cobro y socios capital). Con el botón **Acceso clientes**, arriba a la derecha, entre con cualquiera de estos usuarios (contraseña `Ficticio123!`):

| Usuario | Rol | Qué probar |
|---|---|---|
| `admin@ficticio.test` | Administración | **Estadísticas** generales, por cliente y de todas las inversiones; calcular y confirmar rendimientos, registrar pagos, dar de alta clientes con beneficiarios e inversiones por ramo, subir documentos, revisar la bitácora |
| `hector.galeana@ficticio.test` | Inversionista | Tres inversiones: Movilidad, Transporte con reinversión y Fast Food vencida |
| `cesar.daniel@ficticio.test` | Inversionista | Transporte mensual en pesos y Transporte anual en **dólares** |
| `victoria.perez@ficticio.test` | Inversionista | Fast Food mensual e inversión a **CETES − 1 punto** |

**Flujo sugerido:**
1. Como administración, en **Rendimientos**, elija `FICT-2026-001`, calcule el periodo 2026-01-15 → 2026-02-15 y confírmelo.
2. En **Pagos externos**, registre el pago y asígnelo a ese periodo.
3. Entre como Héctor y verá el rendimiento confirmado, el pago y el saldo pendiente.

Notas:
- **MFA:** en local la verificación en dos pasos de administración está **desactivada** (`REQUIRE_ADMIN_MFA="false"`). En staging y producción es obligatoria.
- **Base de datos:** `npm run setup:local -- --reset` la deja como nueva.
- **Correos:** en local solo se registran en consola (`EMAIL_PROVIDER="log"`).

### Desarrollo con recarga en caliente
```bash
npm run dev        # terminal 1: API en http://localhost:8787
npm run dev:web    # terminal 2: interfaz en http://localhost:5173 (proxy a /api)
```
La interfaz también funciona sin backend, con datos de ejemplo: `npm --prefix web run dev:mock`.

## Pruebas

```bash
npm run test:all   # 63 pruebas del backend + 53 de la interfaz
npm run typecheck  # backend y frontend
```

## Despliegue
Consulte [docs/deployment-and-operations.md](docs/deployment-and-operations.md):
- recursos;
- secretos;
- primer administrador;
- staging con datos ficticios;
- respaldos;
- reversión.

`npm run deploy:staging` y `npm run deploy:production` compilan la interfaz antes de publicar.

### Dos dominios, un solo Worker (producción)
| Dominio | Qué muestra |
| --- | --- |
| `pimexfortexcapital.com.mx` | Página corporativa. "Acceso clientes" lleva al portal. No expone la API. `/login`, `/app`, `/admin`, `/recuperar` y `/restablecer` redirigen (302) al portal. `www.` redirige (301) al dominio sin www. |
| `clientes.pimexfortexcapital.com.mx` | Portal: la raíz muestra el login o, con sesión, el panel según el rol. API, cookies y enlaces de recuperación. |

- El Worker atiende todas las peticiones (`run_worker_first: true`) y decide por dominio (`PUBLIC_HOST` / `PORTAL_HOST`, ver `src/worker/middleware/sites.ts`); en el HTML deja `<meta name="site">` para que React sepa qué sitio es. Sin esas variables (local, staging) funciona como un solo sitio.
- La cookie de sesión no define `Domain`: solo viaja al portal. CSRF acepta escrituras únicamente con `Origin` del portal.
- Ambos dominios se agregan como **Custom Domains** del Worker (Settings › Domains & Routes). `workers_dev` está desactivado en producción.
- Probarlo en local con los dos dominios (Chromium resuelve `*.localhost` a 127.0.0.1):
  `npx wrangler dev --var PUBLIC_HOST:sitio.localhost --var PORTAL_HOST:clientes.localhost --var APP_BASE_URL:http://clientes.localhost:8787`
  y abrir http://sitio.localhost:8787 y http://clientes.localhost:8787.

## Documentación
- [docs/01-alcance-aprobado.md](docs/) y reglas: alcance y decisiones pendientes del cliente.
- [docs/api-contract.md](docs/api-contract.md): contrato de API v1.1, la fuente única entre frontend y backend.
- [docs/frontend-integraciones-pendientes.md](docs/frontend-integraciones-pendientes.md): estado de la integración.
- [web/README.md](web/README.md): detalles de la interfaz.
