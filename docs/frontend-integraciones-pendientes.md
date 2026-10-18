# Estado de la integración frontend ↔ backend

**Rama:** `integracion/portal-v1`, que fusiona `feature/backend-financiero` y `feature/frontend-portal`.
**Contrato:** [api-contract.md](api-contract.md) v1.1.

## Integrado y verificado

Todos los endpoints que consume `web/src/api/http.ts` existen en el backend y responden con la forma esperada. Esto incluye los que antes estaban marcados como PROPUESTO:
- **Inversionista:** serie de la gráfica y avisos.
- **Administración:** resumen, partidas, pagos, documentos con descarga y avisos.

También funcionan los cambios que pidió el cliente:
- documentos solo para administración;
- ramo de la inversión;
- beneficiarios.

**Verificación realizada:**
- **Pruebas automáticas:** 56 del backend con D1 simulado y 39 de la interfaz.
- **Recorrido completo en navegador real** (Edge, con `wrangler dev` y el motor D1 real):
  1. login de administración con cookie HttpOnly;
  2. vista previa y confirmación de dos periodos;
  3. pago externo asignado, y rechazo del doble envío por referencia duplicada;
  4. alta de cliente con beneficiarios;
  5. alta de inversión de Transporte con condiciones de referencia;
  6. carga de un PDF y su registro en la bitácora;
  7. el inversionista ve resumen, gráfica e historial con las cifras del backend;
  8. el inversionista no tiene acceso a administración ni a inversiones ajenas;
  9. al cerrar sesión, la cookie se invalida.

**Corregido durante la integración:**
- Al registrar un pago, el mensaje de éxito desaparecía porque el formulario se reiniciaba; ahora queda visible.
- Las descargas usan el nombre de archivo UTF-8 (conserva acentos).
- Si una pantalla de administración responde `MFA_SETUP_REQUIRED`, ahora ofrece ir directo a **Seguridad**.

## Diferencias conocidas (intencionales)

- **Inversiones ajenas:** si un inversionista abre una inversión que no es suya, la API responde **404** (no revela que existe). La interfaz muestra "No encontrado".
- **Generado = confirmado:** el backend no guarda devengos en borrador, así que "Rendimiento generado" muestra lo mismo que "Rendimiento confirmado". Si el cliente quiere ver devengos aún no confirmados, hay que definir cómo calcularlos (decisiones contractuales).

## Agregado en la versión 1.2 (pedido del cliente)

- **Modalidades de cobro:** mensual, semestral, **anual** y a liquidación (al vencimiento).
- **Moneda por inversión:** pesos (MXN) o dólares (USD). Los resúmenes muestran un bloque por moneda y nunca suman pesos con dólares.
- **Inversión a CETES − 1 punto:**
  - es tasa variable; la tasa aplicada es la tasa CETES vigente al inicio de cada periodo más el diferencial;
  - la administración captura las tasas que publica Banxico en **Administración › Tasas CETES**;
  - una tasa ya usada en un rendimiento confirmado queda bloqueada.
- **Migración `0003`:** reconstruye `investments` e `investment_terms`, y se detiene sin tocar nada si la base ya tiene inversiones. Hay que aplicarla antes del primer despliegue; las bases locales se recrean con `npm run setup:local -- --reset`.

## Pendiente antes de producción

1. **Aprobación por escrito de las convenciones:** base de días, fechas de corte, significado de "a liquidación" y fecha efectiva de la reinversión. Hasta entonces `FINANCIAL_RULES_APPROVED="false"` bloquea las confirmaciones en producción.
2. **CETES:** confirmar con el cliente tres cosas:
   - qué plazo aplica (28, 91, 182 o 364 días); en la interfaz se elige por inversión y el valor sugerido es 28;
   - qué fecha de observación se usa (hoy: la tasa vigente al inicio de cada periodo);
   - que "−1 punto" significa 100 puntos básicos.

   Además, falta definir quién captura la tasa semanal; podría automatizarse con la API de Banxico (SIE), que requiere un token del cliente.
3. **Correo:** definir proveedor y dominio remitente, verificar SPF/DKIM y guardar `EMAIL_API_KEY` como secreto.
4. **Infraestructura:**
   - IDs reales de D1 y R2;
   - subdominio del cliente (`APP_BASE_URL`);
   - primer administrador con `npm run admin:sql`.
5. **Staging:** cargar los datos ficticios (`npm run seed:sql`) y hacer la revisión de aceptación del cliente.
6. **Respaldos:** exportación externa semanal de D1 y R2 (ver la guía operativa).
7. **Logo:** pedir el logotipo en vector (SVG o PDF) para mejorar la nitidez del emblema.
