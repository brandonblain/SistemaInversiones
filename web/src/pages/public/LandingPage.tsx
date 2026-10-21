import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { homeFor } from '../../auth/RequireRole';
import { cx } from '../../components/ui';
import { MarketTicker } from '../../components/MarketTicker';
import { Icon } from '../../components/icons';
import { useReveal } from '../../hooks/useReveal';
import { BRAND } from '../../layouts/brand';
import { portalHref, site } from '../../lib/site';
import { LEGAL_DOCS } from '../../legal/documents';

// Contenido del cliente (Pimex Fortex Capital S.A.S.): enfoque B2B, sin lenguaje de inversión ni tasas;
// las condiciones comerciales se fijan en cada contrato mercantil privado.
//
// Color: las franjas en negro ejecutivo usan los tokens band / on-band (texto siempre claro en ambos modos);
// las secciones claras usan page / surface / ink, que se adaptan solas al modo oscuro.
// Imágenes: portada del cliente; líneas de negocio con fotos de licencia Unsplash (Michael Förtsch,
// Harry Gillen, Sara Kurfeß, Acton Crawford). Se muestran cerca de su tamaño natural y sin texto encima.

const NAV = [
  { href: '#empresa', label: 'Nuestra empresa' },
  { href: '#lineas', label: 'Líneas de negocio' },
  { href: '#clientes', label: 'Clientes' },
  { href: '/legal', label: 'Documentos legales' }
];

const STATS = [
  { value: '4', label: 'líneas de negocio' },
  { value: 'B2B', label: 'negocios entre empresas' },
  { value: 'S.A.S.', label: 'sociedad mercantil mexicana' }
];

const EMPRESA = {
  quienes:
    'En Pimex Fortex Capital somos una firma especializada en consultoría financiera y una incubadora de negocios de alta ejecución. Nos enfocamos en estructurar, acelerar y consolidar proyectos comerciales rentables y de alta demanda. A través de un sólido modelo corporativo basado en la propiedad de activos estratégicos, movilidad sustentable, vehículos extranjeros legalizados, infraestructura comercial móvil y soluciones tecnológicas avanzadas, brindamos a nuestros clientes las herramientas necesarias para escalar su operación con absoluta certeza jurídica y rentabilidad.',
  mision:
    'Impulsar el desarrollo, estructuración y aceleración de negocios exitosos mediante una consultoría financiera rigurosa y la provisión de activos, unidades móviles e infraestructura tecnológica de vanguardia. Proveemos soluciones comerciales e integrales bajo estrictos estándares mercantiles, generando valor y crecimiento sostenible para nuestros clientes y aliados estratégicos.',
  vision:
    'Consolidarnos como la incubadora de negocios y consultoría financiera líder a nivel nacional, reconocida por su capacidad de innovación, solidez patrimonial y excelencia en la estructuración de proyectos de movilidad, comercio móvil, tecnología y transporte especializado, estableciendo el estándar más alto de eficiencia operativa y cumplimiento en el mercado.'
};

const LINEAS = [
  {
    title: 'Movilidad y Vehículos Eléctricos',
    kind: 'Comercialización y Arrendamiento',
    text: 'Importación, venta (contado o esquemas a plazos con reserva de dominio) y arrendamiento mercantil de flotas de vehículos eléctricos ligeros, incluyendo motos y triciclos, optimizados para la última milla y la reducción de costos operativos urbanos.',
    img: '/landing/linea-movilidad.jpg'
  },
  {
    title: 'Food Trucks y Unidades Móviles Gastronómicas',
    kind: 'Renta y Venta',
    text: 'Diseño, equipamiento, comercialización y arrendamiento mercantil de vehículos utilitarios adaptados como Food Trucks y unidades móviles comerciales. Brindamos a los emprendedores gastronómicos la infraestructura física lista para operar, con esquemas flexibles de adquisición o renta para acelerar su inserción en el mercado.',
    img: '/landing/ramo-food-truck.jpg'
  },
  {
    title: 'Vehículos Extranjeros Legalizados',
    kind: 'Comercialización',
    text: 'Adquisición de vehículos de procedencia extranjera debidamente legalizados mediante pedimento de importación definitiva a nombre de la empresa, listos para su venta comercial y óptima integración al mercado.',
    img: '/landing/linea-vehiculos.jpg'
  },
  {
    title: 'Soluciones Tecnológicas y Creativas',
    kind: 'Innovación y Producción Multimedios',
    text: 'Desarrollo de software a la medida, aplicaciones móviles, provisión de servicios especializados con drones, producción profesional de video y audio, así como soluciones integrales en diseño gráfico y web para potenciar la presencia, imagen y eficiencia operativa de las empresas en el entorno digital.',
    img: '/landing/linea-tecnologia.jpg'
  }
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
        <MarketTicker />
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <a href="#inicio" className="mr-auto flex min-h-[44px] min-w-[44px] items-center gap-3" aria-label={`${BRAND.name}, inicio`}>
            <img src={BRAND.logoSrc} alt="" width={62} height={44} className="h-10 w-auto sm:h-11" />
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
                Negocios B2B para desarrollar los negocios de emprendedores.
              </h1>
              <p data-reveal style={delay(2)} className="mt-5 max-w-[46ch] text-lg leading-relaxed text-on-band-2">
                Desarrollando así la más rentable y sustentable incubadora de negocios: movilidad eléctrica, food trucks, vehículos legalizados y soluciones tecnológicas.
              </p>
              <div data-reveal style={delay(3)} className="mt-8 flex flex-col gap-3 min-[460px]:flex-row min-[460px]:items-center">
                <a href="#lineas" className={ctaOnBand}>
                  Conoce nuestras líneas de negocio
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
                src="/landing/hero-empresa.jpg"
                alt="Equipo de trabajo en una reunión de consultoría"
                width={612}
                height={408}
                className="aspect-[3/2] w-full rounded-2xl object-cover ring-1 ring-band-line"
              />
            </figure>
          </div>
        </section>

        {/* ---------- Nuestra empresa ---------- */}
        <section id="empresa" className="scroll-mt-20 border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
            <div data-reveal>
              <p className={cx(eyebrow, 'text-brand')}>Nuestra empresa</p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">Quiénes somos</h2>
              <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-ink-2">{EMPRESA.quienes}</p>
            </div>
            <dl className="space-y-8 border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-1">
              {[
                ['Misión', EMPRESA.mision],
                ['Visión', EMPRESA.vision]
              ].map(([title, text], i) => (
                <div key={title} data-reveal style={delay(i + 1)}>
                  <dt className="font-display text-xl font-bold text-ink">{title}</dt>
                  <dd className="mt-2 leading-relaxed text-ink-2">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ---------- Líneas de negocio y soluciones ---------- */}
        <section id="lineas" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <div data-reveal className="grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end lg:gap-14">
            <div>
              <p className={cx(eyebrow, 'text-brand')}>Líneas de negocio</p>
              <h2 className="mt-3 text-balance text-3xl font-extrabold leading-tight sm:text-4xl">Nuestras líneas de negocio y soluciones</h2>
            </div>
            <p className="max-w-[52ch] text-lg leading-relaxed text-ink-2">
              <strong className="font-semibold text-ink">Negocios sustentables y rentables:</strong> impulsamos a emprendedores para que desarrollen su modelo de negocios mediante nuestra incubadora de negocios.
            </p>
          </div>
          <ol className="mt-10 grid gap-5 md:grid-cols-2">
            {LINEAS.map((l, i) => (
              <li key={l.title} data-reveal style={delay(i)} className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
                <img src={l.img} alt="" width={640} height={320} loading="lazy" className="aspect-[2/1] w-full object-cover" />
                <div className="flex-1 p-6">
                  <p className="figure text-sm font-bold text-brand">{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="mt-1 text-xl font-bold text-ink">{l.title}</h3>
                  <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-ink-2">{l.kind}</p>
                  <p className="mt-1.5 leading-relaxed text-ink-2">{l.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Llamado a la acción ---------- */}
        <section id="clientes" className="band scroll-mt-20 bg-band text-on-band">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">¿Ya eres cliente?</h2>
              <p className="mt-1 text-on-band-2">Consulta tu contrato en tu portal privado.</p>
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
                <source srcSet={BRAND.logoSrc} media="(prefers-color-scheme: dark)" />
                <img src={BRAND.logoTileSrc} alt="" width={56} height={40} className="h-10 w-auto rounded-md" />
              </picture>
              <span className="font-semibold text-ink">{BRAND.name}</span>
            </span>
            <span>© {new Date().getFullYear()} {BRAND.legalName}</span>
          </div>
          <nav aria-label="Documentos legales" className="mt-4">
            <ul className="flex flex-wrap gap-x-4">
              {LEGAL_DOCS.filter((d) => d.group === 'sitio').map((d) => (
                <li key={d.slug}>
                  <Link to={`/legal/${d.slug}`} className="inline-flex min-h-[44px] items-center text-sm font-medium text-ink hover:text-brand hover:underline">
                    {d.short}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/legal" className="inline-flex min-h-[44px] items-center text-sm font-medium text-brand hover:underline">
                  Todos los documentos
                </Link>
              </li>
            </ul>
          </nav>
          <p className="mt-3 max-w-[62ch] text-xs leading-relaxed">
            Las condiciones comerciales se establecen de manera formal y definitiva en cada contrato mercantil privado.
            Pimex Fortex Capital S.A.S. no es una institución bancaria ni realiza actividades reguladas de intermediación financiera.
            Indicadores (tipos de cambio, UDIS, tasas y CETES): Banco de México (SIE), con fines informativos.
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
