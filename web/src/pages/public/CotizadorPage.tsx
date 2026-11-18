import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../../components/icons';
import { cx, KpiTile, LoadingBlock } from '../../components/ui';
import { CAPITAL_MAXIMO_CENTS, cotizar, PRODUCTOS } from '../../cotizador/cotizador';
import { BRAND } from '../../layouts/brand';
import { formatMoney } from '../../lib/format';
import { parsePesosToCents } from '../../lib/parse';

const CotizadorChart = lazy(() => import('../../charts/CotizadorChart'));

const MONTOS_RAPIDOS = [50_000, 100_000, 250_000, 500_000, 1_000_000];
const eyebrow = "flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] before:h-0.5 before:w-6 before:shrink-0 before:bg-signal before:content-['']";

/** Centavos → texto del campo con separadores de miles: 10000000 → "100,000"; 10000050 → "100,000.50". */
const textoCapital = (cents: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(cents / 100);

function capitalDesde(texto: string): { cents: number | null; error: string | null } {
  if (!texto.trim()) return { cents: null, error: null };
  if (/-/.test(texto)) return { cents: null, error: 'El capital no puede ser negativo.' };
  const cents = parsePesosToCents(texto);
  if (cents === null) return { cents: null, error: 'Escriba solo números; puede usar comas para los miles y hasta dos decimales.' };
  if (cents <= 0) return { cents: null, error: 'Escriba un monto mayor a cero.' };
  if (cents > CAPITAL_MAXIMO_CENTS) return { cents: null, error: `El monto máximo es ${formatMoney(CAPITAL_MAXIMO_CENTS)}.` };
  return { cents, error: null };
}

/**
 * Cotizador privado (/cotizador): sin enlaces desde la navegación, el pie de página ni el catálogo; se abre
 * solo con la dirección. El servidor lo marca como no indexable (cabecera X-Robots-Tag y meta robots).
 * No usa datos de clientes: solo la configuración pública de productos.
 */
export function CotizadorPage() {
  const [productoId, setProductoId] = useState(PRODUCTOS[0]?.id ?? '');
  const [texto, setTexto] = useState(textoCapital(10_000_000));
  const producto = PRODUCTOS.find((p) => p.id === productoId) ?? PRODUCTOS[0];
  const { cents, error } = capitalDesde(texto);
  const cotizacion = cents !== null && producto ? cotizar(cents, producto) : null;

  useEffect(() => {
    document.title = `Cotiza tu inversión · ${BRAND.name}`;
    // Refuerzo en el cliente; el servidor ya entrega la etiqueta en el HTML
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    meta.content = 'noindex, nofollow';
  }, []);

  const tiles: Array<{ label: string; value: string; icon: IconName }> = cotizacion
    ? [
        { label: 'Capital inicial', value: formatMoney(cotizacion.capitalCents), icon: 'cash' },
        { label: 'Ganancia estimada', value: formatMoney(cotizacion.gananciaCents), icon: 'chart' },
        { label: 'Rendimiento total', value: `${cotizacion.rendimientoPct} %`, icon: 'percent' },
        { label: 'Plazo de inversión', value: `${cotizacion.meses} meses`, icon: 'clock' }
      ]
    : [];

  return (
    <div className="site min-h-screen bg-page text-ink">
      <header className="band border-b border-band-line bg-band">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-h-[44px] items-center gap-3" aria-label={`${BRAND.name}, inicio`}>
            <img src={BRAND.logoSrc} alt="" width={56} height={40} className="h-10 w-auto" />
            <span className="hidden text-sm font-semibold text-on-band-2 sm:block">Cotizador</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className={cx(eyebrow, 'text-brand')}>Cotizador</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">Cotiza tu inversión</h1>
        <p className="mt-3 max-w-[60ch] text-lg text-ink-2">
          Descubre el potencial de tu inversión y conoce cuánto podrías obtener al finalizar el plazo seleccionado.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          {/* Configuración */}
          <section aria-labelledby="config" className="rounded-card border border-line bg-surface p-5 sm:p-6">
            <h2 id="config" className="text-lg font-bold text-ink">1. Elige el tipo de inversión</h2>
            <div role="radiogroup" aria-labelledby="config" className="mt-4 grid gap-3 sm:grid-cols-2">
              {PRODUCTOS.map((p) => {
                const selected = p.id === producto?.id;
                return (
                  <label
                    key={p.id}
                    className={cx(
                      'flex cursor-pointer gap-3 rounded-lg border-2 p-3 transition-colors',
                      selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50'
                    )}
                  >
                    <input type="radio" name="producto" value={p.id} checked={selected} onChange={() => setProductoId(p.id)} className="mt-1 h-4 w-4 shrink-0 accent-[oklch(var(--brand))]" />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{p.nombre}</span>
                      <span className="mt-0.5 block text-sm text-ink-2">
                        {p.meses} meses · <span className="font-semibold text-ink">{p.rendimientoPct} %</span> total
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>

            <h2 className="mt-8 text-lg font-bold text-ink">
              <label htmlFor="capital">2. Capital a invertir</label>
            </h2>
            <div className="relative mt-3">
              <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-2">$</span>
              <input
                id="capital"
                inputMode="decimal"
                autoComplete="off"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onBlur={() => cents !== null && setTexto(textoCapital(cents))}
                aria-invalid={!!error}
                aria-describedby="capital-ayuda"
                className={cx(
                  'figure min-h-[52px] w-full rounded-lg border bg-surface py-3 pl-9 pr-16 text-xl font-bold text-ink focus:outline-none focus:ring-2 focus:ring-brand/40',
                  error ? 'border-bad' : 'border-line'
                )}
              />
              <span aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-muted">MXN</span>
            </div>
            <p id="capital-ayuda" className={cx('mt-1.5 text-sm', error ? 'font-medium text-bad' : 'text-ink-muted')}>
              {error ?? 'Pesos mexicanos. Ejemplo: 250,000 o 250000.50'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Montos de ejemplo">
              {MONTOS_RAPIDOS.map((m) => {
                const active = cents === m * 100;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTexto(textoCapital(m * 100))}
                    aria-pressed={active}
                    className={cx(
                      'pressable min-h-[40px] rounded-full border px-3.5 text-sm font-semibold',
                      active ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-surface text-ink-2 hover:border-brand/50 hover:text-ink'
                    )}
                  >
                    {formatMoney(m * 100).replace('.00', '')}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Resultados */}
          <section aria-labelledby="resultados" aria-live="polite" className="lg:sticky lg:top-6">
            <h2 id="resultados" className="sr-only">Resultado de la cotización</h2>
            {cotizacion && producto ? (
              <>
                <div className="band rounded-card bg-band p-6 text-on-band sm:p-7">
                  <p className="text-sm font-semibold uppercase tracking-wide text-on-band-accent">Capital final estimado</p>
                  <p className="figure mt-2 text-4xl font-extrabold sm:text-5xl" data-testid="capital-final">{formatMoney(cotizacion.capitalFinalCents)}</p>
                  <p className="mt-2 text-sm text-on-band-2">
                    {producto.nombre} · al terminar {cotizacion.meses} meses
                  </p>
                </div>
                <dl className="metric-grid mt-4 grid-cols-2 overflow-hidden rounded-card border border-line">
                  {tiles.map((t) => (
                    <KpiTile
                      key={t.label}
                      label={t.label}
                      value={
                        <span className="flex items-center gap-2">
                          <Icon name={t.icon} className="h-4 w-4 shrink-0 text-brand" />
                          {t.value}
                        </span>
                      }
                    />
                  ))}
                </dl>
              </>
            ) : (
              <div className="rounded-card border border-dashed border-line bg-surface p-8 text-center">
                <Icon name="info" className="mx-auto h-6 w-6 text-ink-muted" />
                <p className="mt-3 font-semibold text-ink">Escribe el capital que deseas invertir</p>
                <p className="mt-1 text-sm text-ink-2">Verás la ganancia estimada, el capital final y la gráfica de crecimiento.</p>
              </div>
            )}
          </section>
        </div>

        {cotizacion && (
          <section className="mt-6 rounded-card border border-line bg-surface p-5 sm:p-6" aria-label="Gráfica de crecimiento">
            <Suspense fallback={<LoadingBlock label="Cargando gráfica…" rows={4} />}>
              <CotizadorChart cotizacion={cotizacion} />
            </Suspense>
          </section>
        )}

        <p className="mt-6 max-w-[80ch] text-xs leading-relaxed text-ink-muted">
          Estimación matemática con fines informativos: Ganancia = Capital × Rendimiento total del plazo; sin interés compuesto ni capitalización.
          No es una oferta ni un rendimiento garantizado. Las condiciones definitivas se establecen en cada contrato.
        </p>
      </main>

      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-2 sm:px-6">© {new Date().getFullYear()} {BRAND.legalName}</p>
      </footer>
    </div>
  );
}
