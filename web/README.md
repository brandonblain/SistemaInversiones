# Verticimax México Star Up — Portal de inversionistas (frontend)

React 18 + Vite + TypeScript + Tailwind CSS + Recharts. Se compila a archivos estáticos que sirve Cloudflare Workers Static Assets. El backend (Hono + D1) vive en `src/worker/`.

## Uso

```bash
cd web
npm ci
npm run dev:mock   # interfaz con datos FICTICIOS en memoria, sin backend
npm run dev        # consume /api (proxy a wrangler dev en http://localhost:8787)
npm test           # pruebas de UI y de formato (Vitest + Testing Library)
npm run build      # tsc + vite build → web/dist
```

Para revisar una pantalla con la sesión ya iniciada (solo modo mock):

```bash
VITE_MOCK_AUTOLOGIN=usr_fict_01 npm run dev:mock     # entra como Héctor Galeana
VITE_MOCK_AUTOLOGIN=usr_fict_admin npm run dev:mock  # entra como administración
```

## Usuarios de prueba (datos FICTICIOS)

Los nombres vienen de los "Socios capital" del material comercial. Las cifras, correos, RFC y domicilios son inventados.

| Rol | Nombre | Correo | Inversiones de ejemplo |
|---|---|---|---|
| Inversionista | Héctor Galeana | hector.galeana@ficticio.test | Movilidad (mensual), Transporte (semestral con reinversión), Fast Food (vencida) |
| Inversionista | Cesar Daniel | cesar.daniel@ficticio.test | Transporte (mensual, con un pago parcial) |
| Inversionista | Victoria Pérez | victoria.perez@ficticio.test | Fast Food (mensual, complemento de pensión) |
| Administración | — | admin@ficticio.test | Código MFA 123456 |

Contraseña de todos: `Ficticio123!`. En modo mock, todas las pantallas muestran la franja "Prototipo con datos FICTICIOS".

## Navegación

**Inversionista** (barra inferior en móvil, lateral en escritorio):
- Inicio
- Inversiones
- Detalle de inversión (Resumen / Evolución / Rendimientos y pagos)
- Avisos
- Perfil

El inversionista **no tiene acceso a documentos**.

**Administración** (menú lateral; desplegable en móvil):
- Resumen
- Inversionistas: lista, alta con beneficiarios (nombre, parentesco y porcentaje que suman 100 %) y detalle
- Inversiones: lista, alta por ramo (Fast Food / Movilidad / Transporte) con condiciones de referencia, y detalle
- Rendimientos: vista previa → confirmar, ajustes, reversiones y reinversión
- Pagos externos: registro y asignación
- Documentos: subir, descargar y archivar
- Avisos
- Bitácora
- Seguridad (MFA)

## Reglas de diseño que respeta el código

- **Sin cálculos financieros en el navegador.** Las cifras (centavos y puntos básicos) se muestran tal como llegan de la API. Solo se formatean (`src/lib/format.ts`, con BigInt) y se convierte la captura del administrador a enteros (`src/lib/parse.ts`).
- **Seis indicadores separados:** capital, generado, confirmado, pagado, reinvertido y pendiente. El pendiente se aclara como "no es dinero disponible".
- **Proyecciones aparte:** solo aparecen en Admin › Rendimientos, marcadas "Proyección · aún no confirmada".
- **Sesión:** solo cookie HttpOnly. No se usa `localStorage` ni `sessionStorage`.
- **Documentos privados:** solo para administración; se descargan por endpoint autenticado como Blob, sin URLs públicas.
- **Fechas:** las contractuales (`YYYY-MM-DD`) se muestran sin conversión de huso. Las marcas de tiempo se muestran en hora de Ciudad de México.
- **Accesibilidad:** contraste AA, objetivos táctiles de 44 px, tablas que en móvil se convierten en tarjetas, gráficas con vista de tabla y modo oscuro.

## Marca

- **Colores:** azul marino oscuro como color de plataforma, con tonalidades para navegación y superficies (variables `--brand`, `--nav*` en `src/index.css`).
- **Nombre:** `src/layouts/brand.ts`.
- **Imágenes** en `public/`, extraídas de la imagen del cliente:
  - `logo-emblem.png`: águila + U con fondo transparente.
  - `logo-plate.jpg`: logotipo completo sobre su azul original.
  - `favicon.png`.

## Estructura

```
src/
  api/          cliente HTTP, tipos del contrato, implementación real (http.ts) y mock FICTICIO
  auth/         sesión en memoria y protección por rol
  charts/       gráficas (carga diferida)
  components/   UI reutilizable (tablas paginadas, KPI, modales, beneficiarios, estados vacíos/error)
  layouts/      estructura de inversionista y administración
  lib/          formato MXN/fechas, captura, etiquetas en español
  pages/        pantallas por área
  test/         pruebas de UI
```

Lo que falta conectar con el backend está en [`docs/frontend-integraciones-pendientes.md`](../docs/frontend-integraciones-pendientes.md).
