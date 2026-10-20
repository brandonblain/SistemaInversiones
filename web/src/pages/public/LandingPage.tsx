import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { homeFor } from '../../auth/RequireRole';
import { cx } from '../../components/ui';
import { cetesMinusOnePoint, formatFx, useMarket } from '../../components/MarketIndicators';
import { formatDate, formatRateBps } from '../../lib/format';
import { Icon } from '../../components/icons';
import { useReveal } from '../../hooks/useReveal';
import { BRAND } from '../../layouts/brand';
import { portalHref, site } from '../../lib/site';

// Contenido tomado del material comercial de la empresa (marca actual: Pimex Fortex Capital).
// Tasas, plazos y capitales son condiciones de referencia; cada contrato fija las definitivas.
//
// Color: las franjas en negro ejecutivo usan los tokens band / on-band (texto siempre claro en ambos modos);
// las secciones claras usan page / surface / ink, que se adaptan solas al modo oscuro.
// Imágenes: provienen de la presentación comercial (baja resolución), por eso se muestran a un
// tamaño cercano al natural y el texto nunca va encima de ellas.

const NAV = [
  { href: '#ramos', label: 'Ramos' },
  { href: '#inversiones', label: 'Inversiones' },
  { href: '#cobro', label: 'Rendimientos' },
  { href: '#socios', label: 'Socios capital' }
];

const STATS = [
  { value: '4', label: 'ramos de negocio' },
  { value: '2', label: 'monedas: pesos y dólares' },
  { value: '25 %', label: 'tasa anual fija máxima' }
];

const RAMOS = [
  { title: 'Transporte', detail: 'Movilidad personal, transporte público y transporte de carga.', img: '/landing/ramo-transporte.jpg', w: 500, h: 250 },
  { title: 'Alimentos', detail: 'Restaurantes de comida rápida en operación.', img: '/landing/ramo-alimentos.jpg', w: 500, h: 250 },
  { title: 'Bienes raíces', detail: 'Desarrollos inmobiliarios y turísticos.', img: '/landing/ramo-bienes-raices.jpg', w: 503, h: 245 }
];

// Miniaturas cuadradas de 288 px. Movilidad y vehículos eléctricos: fotos con licencia Unsplash
// (saif71.com y Michael Förtsch); el resto, fotos entregadas por el cliente.
const OPCIONES: Array<{ name: string; tasa: string; nota: string; capital: string; plazo: string; img: string; compact?: boolean }> = [
  { name: 'Transporte', tasa: '25 %', nota: 'anual fija', capital: '$400,000.00', plazo: '18 meses', img: '/landing/op-transporte.jpg' },
  { name: 'Movilidad', tasa: '16 %', nota: 'anual fija', capital: '$250,000.00', plazo: '12 meses', img: '/landing/op-movilidad.jpg' },
  { name: 'Vehículos eléctricos', tasa: '16 %', nota: 'anual fija', capital: 'Según contrato', plazo: 'Según contrato', img: '/landing/op-electricos.jpg' },
  { name: 'Fast Food', tasa: '13 %', nota: 'anual fija', capital: '$100,000.00', plazo: '12 meses', img: '/landing/op-fastfood.jpg' },
  { name: 'CETES', tasa: 'CETES − 1', nota: 'punto · variable, solo en pesos', capital: 'Según contrato', plazo: 'Según contrato', img: '/landing/op-cetes.jpg', compact: true }
];

const COBRO = [
  { title: 'Mensual', text: 'Recibe tus rendimientos cada mes.' },
  { title: 'Semestral', text: 'Un cobro cada seis meses.' },
  { title: 'Anual', text: 'Un cobro al año sobre tu capital.' },
  { title: 'A liquidación', text: 'Todo al terminar el contrato.' }
];

const SOCIOS = [
  { name: 'Victoria Pérez', role: 'Socia capital', quote: 'Como jubilada he logrado crear un ingreso pasivo mensual incrementando mi pensión. Es como si tuviera dos sueldos.' },
  { name: 'Héctor Galeana', role: 'Socio capital', quote: 'Llevo 4 años con este producto financiero y he logrado duplicar mi capital.' },
  { name: 'Cesar Daniel', role: 'Socio capital', quote: 'Con mi inversión, en dos años logré pagar las mensualidades de mi crédito de auto.' }
];

const delay = (i: number) => ({ '--reveal-delay': `${i * 60}ms` }) as CSSProperties;
// Encabezado de sección con la línea roja corta del logotipo
const eyebrow = "flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] before:h-0.5 before:w-6 before:shrink-0 before:bg-signal before:content-['']";
const ctaOnBand = 'pressable inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-on-band px-6 font-bold text-band hover:bg-on-band-2';

export function LandingPage() {
  const { session } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useReveal(rootRef);
  // Indicadores de Banxico en vivo (informativos); si no hay datos, la página muestra solo lo fijo
  const market = useMarket().data;
  const fx = market?.available ? market.fx : null;
  const cetes28 = market?.available ? market.cetes.CETES_28 : undefined;
  const access =
    site().kind === 'public'
      ? { to: portalHref('/'), label: 'Acceso clientes', external: true }
      : session
        ? { to: homeFor(session.user.role), label: 'Ir a mi portal', external: false }
        : { to: '/login', label: 'Acceso clientes', external: false };

  useEffect(() => {
    document.title = `${BRAND.name} · Ecosistema de negocios`;
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div ref={rootRef} className="site min-h-screen bg-page text-ink">
      {/* ---------- Encabezado ---------- */}
      <header className="band sticky top-0 z-30 border-b border-band-line bg-band">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <a href="#inicio" className="mr-auto flex min-h-[44px] min-w-[44px] items-center gap-3" aria-label={`${BRAND.name}, inicio`}>
            <img src={BRAND.emblemDarkSrc} alt="" width={118} height={36} className="h-7 w-auto sm:h-9" />
            <span className="hidden border-l border-band-line pl-3 leading-tight md:block">
              <span className="font-display block text-sm font-extrabold uppercase tracking-wide text-on-band [font-stretch:112%]">Pimex Fortex</span>
              <span className="block text-xs font-semibold uppercase tracking-[0.3em] text-on-band-2">Capital</span>
            </span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-on-band-2 transition-colors hover:bg-band-raised hover:text-on-band">
                {n.label}
              </a>
            ))}
          </nav>
          <AccessLink access={access} className="pressable inline-flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-on-band px-3 text-sm font-bold text-band hover:bg-on-band-2 sm:px-4 lg:ml-4">
            <Icon name="user" className="h-4 w-4" />
            {access.label}
          </AccessLink>
          <button
            type="button"
            className="pressable inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-band hover:bg-band-raised lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="menu-sitio"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} className="h-5 w-5" />
          </button>
        </div>
        {menuOpen && (
          <nav id="menu-sitio" aria-label="Secciones" className="menu-panel border-t border-band-line px-4 pb-4 pt-2 lg:hidden">
            <ul className="mx-auto max-w-6xl">
              {NAV.map((n) => (
                <li key={n.href}>
                  <a
                    href={n.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex min-h-[48px] items-center justify-between rounded-lg px-3 font-semibold text-on-band hover:bg-band-raised"
                  >
                    {n.label}
                    <Icon name="chevronRight" className="h-4 w-4 text-on-band-2" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="inicio">
        {/* ---------- Portada ---------- */}
        <section
          id="ecosistema"
          className="band relative overflow-hidden bg-band text-on-band"
          // Halo de azul profundo (#003366) fijo, igual en ambos modos
          style={{ backgroundImage: 'radial-gradient(ellipse 80% 75% at 0% 0%, oklch(0.323 0.103 253.9 / 0.6), transparent 70%)' }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pb-24 lg:pt-20">
            <div>
              <p data-reveal style={delay(0)} className={cx(eyebrow, 'text-on-band-accent')}>Ecosistema de negocios</p>
              <h1 data-reveal style={delay(1)} className="mt-4 text-balance text-[clamp(2.125rem,1.4rem+3.4vw,3.75rem)] font-extrabold leading-[1.05] [font-stretch:112%]">
                Unimos a los dueños del capital con los emprendedores.
              </h1>
              <p data-reveal style={delay(2)} className="mt-5 max-w-[46ch] text-lg leading-relaxed text-on-band-2">
                Desarrollando así la más rentable y sustentable incubadora de negocios: transporte, movilidad, alimentos y bienes raíces.
              </p>
              <div data-reveal style={delay(3)} className="mt-8 flex flex-col gap-3 min-[460px]:flex-row min-[460px]:items-center">
                <a href="#inversiones" className={ctaOnBand}>
                  Ver opciones de inversión
                </a>
                <AccessLink
                  access={access}
                  className="pressable inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg border border-band-line px-5 font-semibold text-on-band hover:bg-band-raised"
                >
                  <Icon name="user" className="h-4 w-4" /> {access.label}
                </AccessLink>
              </div>
              {/* Línea roja → azul: la flecha del logotipo */}
              <span
                aria-hidden
                data-reveal
                style={{ ...delay(4), background: 'linear-gradient(90deg, oklch(var(--signal)) 0 30%, oklch(var(--on-band-accent)) 30% 100%)' }}
                className="mt-10 block h-[3px] max-w-lg rounded-full"
              />
              <dl data-reveal style={delay(4)} className="mt-6 grid max-w-lg grid-cols-3">
                {STATS.map((s, i) => (
                  <div key={s.label} className={cx('pr-3', i > 0 && 'border-l border-band-line pl-3 sm:pl-5')}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="figure whitespace-nowrap text-2xl font-extrabold leading-tight text-on-band sm:text-3xl">{s.value}</dd>
                    <dd className="mt-1 text-xs leading-snug text-on-band-2 sm:text-sm">{s.label}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure data-reveal style={delay(2)} className="mx-auto w-full max-w-[500px] lg:mr-0">
              <img
                src="/landing/hero-socios.jpg"
                alt="Socios capital y emprendedores conversando frente a un desarrollo en construcción"
                width={500}
                height={343}
                className="aspect-[500/343] w-full rounded-2xl object-cover ring-1 ring-band-line"
              />
            </figure>
          </div>
        </section>

        {/* ---------- Ramos de negocios ---------- */}
        <section id="ramos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-14">
            <div>
              <p className={cx(eyebrow, 'text-brand')}>Dónde invertimos</p>
              <h2 className="mt-3 text-balance text-3xl font-extrabold leading-tight sm:text-4xl">Ramos de negocios reales, que puedes ver y entender.</h2>
            </div>
            <p className="max-w-[52ch] text-lg leading-relaxed text-ink-2">
              Tu capital impulsa empresas en operación: unidades de transporte, movilidad urbana, restaurantes y desarrollos.
            </p>
          </div>
          <ul className="mt-10 grid gap-5 sm:grid-cols-3">
            {RAMOS.map((r, i) => (
              <li key={r.title} data-reveal style={delay(i)} className="overflow-hidden rounded-card border border-line bg-surface">
                <img src={r.img} alt="" width={r.w} height={r.h} loading="lazy" className="aspect-[2/1] w-full object-cover" />
                <div className="p-5">
                  <h3 className="text-lg font-bold text-ink">{r.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">{r.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Opciones: tablero de tasas ---------- */}
        <section id="inversiones" className="band scroll-mt-20 bg-band py-16 text-on-band sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div data-reveal className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className={cx(eyebrow, 'text-on-band-accent')}>Opciones</p>
                <h2 className="mt-3 text-balance text-3xl font-extrabold leading-tight sm:text-4xl">Giros en los que apalancamos tu inversión</h2>
              </div>
              <div className="max-w-[40ch]">
                <p className="text-on-band-2">Invierte en pesos mexicanos o en dólares. CETES, solo en pesos.</p>
                {fx && (
                  <p className="mt-2 text-sm text-on-band-2" data-testid="fx-publico">
                    Tipo de cambio FIX: <strong className="figure text-on-band">{formatFx(fx.rate)}</strong> por dólar · Banxico, {formatDate(fx.date)}
                  </p>
                )}
              </div>
            </div>

            <ul className="mt-10 border-t border-band-line" aria-label="Opciones de inversión">
              {OPCIONES.map((o, i) => (
                <li
                  key={o.name}
                  data-reveal
                  style={delay(i)}
                  className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 border-b border-band-line py-5 md:grid-cols-[64px_minmax(0,1fr)_17rem_10rem] md:gap-x-6 lg:grid-cols-[72px_minmax(0,1fr)_20rem_11rem] lg:gap-x-10"
                >
                  <img src={o.img} alt="" width={72} height={72} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                  <div>
                    <h3 className="text-lg font-bold leading-snug sm:text-xl">{o.name}</h3>
                    {o.compact && cetes28 && (
                      <p className="mt-0.5 text-xs text-on-band-2 sm:text-sm" data-testid="cetes-publico">
                        CETES 28 días: <span className="figure text-on-band">{formatRateBps(cetes28.annual_rate_bps)}</span> · Banxico, {formatDate(cetes28.date)}
                      </p>
                    )}
                  </div>
                  <dl className="col-span-2 col-start-2 row-start-2 grid grid-cols-2 gap-4 md:col-span-1 md:col-start-3 md:row-start-1">
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-on-band-2">Capital</dt>
                      <dd className="figure mt-0.5 font-semibold">{o.capital}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-on-band-2">Plazo</dt>
                      <dd className="mt-0.5 font-semibold">{o.plazo}</dd>
                    </div>
                  </dl>
                  <p className="col-start-3 row-start-1 text-right md:col-start-4">
                    <span className={cx('figure block whitespace-nowrap font-extrabold leading-none', o.compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl')}>
                      {o.tasa}
                    </span>
                    <span className="mt-1.5 block text-xs text-on-band-2 sm:text-sm">
                      {o.compact && cetes28 ? `punto · hoy ≈ ${cetesMinusOnePoint(cetes28.annual_rate_bps)} anual` : o.nota}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Cobro: secuencia numerada ---------- */}
        <section id="cobro" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal>
            <p className={cx(eyebrow, 'text-brand')}>Tú decides</p>
            <h2 className="mt-3 max-w-[22ch] text-balance text-3xl font-extrabold leading-tight sm:text-4xl">Al cobrar tus rendimientos, puedes hacerlo así:</h2>
          </div>
          <ol className="relative mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            <span aria-hidden className="absolute left-5 right-0 top-5 hidden h-px bg-line lg:block" />
            {COBRO.map((c, i) => (
              <li key={c.title} data-reveal style={delay(i)} className="relative">
                <span className="figure relative flex h-10 w-10 items-center justify-center rounded-full bg-brand text-base font-extrabold text-brand-ink ring-8 ring-page">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-bold">{c.title}</h3>
                <p className="mt-1 text-ink-2">{c.text}</p>
              </li>
            ))}
          </ol>
          <p data-reveal className="mt-12 max-w-[60ch] text-ink-2">
            Según tu contrato, también puedes reinvertir tus rendimientos para hacer crecer tu capital.
          </p>
        </section>

        {/* ---------- Socios capital ---------- */}
        <section id="socios" className="scroll-mt-20 border-t border-line bg-surface py-16 sm:py-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
            <figure data-reveal>
              <p className={cx(eyebrow, 'text-brand')}>Socios capital</p>
              <blockquote className="font-display mt-5 text-balance text-2xl font-semibold leading-snug text-ink sm:text-3xl">
                <span aria-hidden className="text-brand">“</span>
                {SOCIOS[0]!.quote}
                <span aria-hidden className="text-brand">”</span>
              </blockquote>
              <figcaption className="mt-5 text-ink-2">
                <strong className="text-ink">{SOCIOS[0]!.name}</strong> · {SOCIOS[0]!.role}
              </figcaption>
            </figure>
            <div className="space-y-8 border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
              {SOCIOS.slice(1).map((s, i) => (
                <figure key={s.name} data-reveal style={delay(i + 1)}>
                  <blockquote className="text-lg leading-relaxed text-ink">“{s.quote}”</blockquote>
                  <figcaption className="mt-2 text-sm text-ink-2">
                    <strong className="text-ink">{s.name}</strong> · {s.role}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Llamado a la acción ---------- */}
        <section className="band bg-band text-on-band">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">¿Ya eres inversionista?</h2>
              <p className="mt-1 text-on-band-2">Consulta tu capital, rendimientos y pagos en tu portal privado.</p>
            </div>
            <AccessLink access={access} className={ctaOnBand}>
              <Icon name="user" className="h-4 w-4" /> {access.label}
            </AccessLink>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-page">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-2 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <picture>
                <source srcSet={BRAND.emblemDarkSrc} media="(prefers-color-scheme: dark)" />
                <img src={BRAND.emblemLightSrc} alt="" width={92} height={28} className="h-7 w-auto" />
              </picture>
              <span className="font-semibold text-ink">{BRAND.name}</span>
            </span>
            <span>© {new Date().getFullYear()} {BRAND.name}</span>
          </div>
          <p className="mt-5 max-w-[62ch] text-xs leading-relaxed">
            Las tasas, plazos y capitales mostrados son de referencia; las condiciones definitivas se establecen en cada contrato.
            Los testimonios reflejan experiencias individuales; los rendimientos pasados no garantizan rendimientos futuros.
            Toda inversión conlleva riesgos. Tipo de cambio y tasas CETES: Banco de México (SIE), con fines informativos.
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Botón de acceso: enlace interno en el mismo sitio, absoluto hacia el subdominio del portal desde el sitio público. */
function AccessLink({ access, className, children }: { access: { to: string; external: boolean }; className: string; children: ReactNode }) {
  return access.external ? (
    <a href={access.to} className={className}>
      {children}
    </a>
  ) : (
    <Link to={access.to} className={className}>
      {children}
    </Link>
  );
}
