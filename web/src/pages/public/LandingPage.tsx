import { useEffect, useRef, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { homeFor } from '../../auth/RequireRole';
import { Icon } from '../../components/icons';
import { useReveal } from '../../hooks/useReveal';
import { BRAND } from '../../layouts/brand';

// Contenido tomado del material comercial de Verticimax México Star Up.
// Tasas, plazos y capitales son condiciones de referencia; cada contrato fija las definitivas.

const NAV = [
  { href: '#ramos', label: 'Ramos' },
  { href: '#inversiones', label: 'Inversiones' },
  { href: '#cobro', label: 'Rendimientos' },
  { href: '#socios', label: 'Socios capital' }
];

const OPCIONES: Array<{ name: string; tasa: string; nota: string; capital: string; plazo: string; img?: string }> = [
  { name: 'Transporte', tasa: '25 %', nota: 'anual fija', capital: '$400,000.00', plazo: '18 meses', img: '/landing/ramo-transporte.jpg' },
  { name: 'Movilidad', tasa: '16 %', nota: 'anual fija', capital: '$250,000.00', plazo: '12 meses', img: '/landing/ramo-movilidad.jpg' },
  { name: 'Vehículos eléctricos', tasa: '16 %', nota: 'anual fija', capital: 'Según contrato', plazo: 'Según contrato', img: '/landing/ramo-vehiculos-electricos.jpg' },
  { name: 'Fast Food', tasa: '13 %', nota: 'anual fija', capital: '$100,000.00', plazo: '12 meses', img: '/landing/ramo-alimentos.jpg' },
  { name: 'CETES', tasa: 'CETES − 1', nota: 'punto · tasa referida a CETES, en pesos', capital: 'Según contrato', plazo: 'Según contrato' }
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

export function LandingPage() {
  const { session } = useAuth();
  const rootRef = useRef<HTMLDivElement>(null);
  useReveal(rootRef);
  const access = session ? { to: homeFor(session.user.role), label: 'Ir a mi portal' } : { to: '/login', label: 'Acceso clientes' };

  useEffect(() => {
    document.title = 'Verticimax México Star Up · Ecosistema de negocios';
  }, []);

  return (
    <div ref={rootRef} className="min-h-screen bg-page text-ink">
      {/* ---------- Encabezado ---------- */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-nav/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#inicio" className="flex items-center gap-2.5" aria-label="Verticimax México Star Up, inicio">
            <img src={BRAND.emblemSrc} alt="" className="h-10 w-auto" />
            <span className="leading-tight">
              <span className="font-display block text-base font-extrabold tracking-wide text-brand-ink [font-stretch:118%]">VERTICIMAX</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-nav-ink">México · Star Up</span>
            </span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-7 lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-sm font-medium text-nav-ink transition-colors hover:text-brand-ink">{n.label}</a>
            ))}
          </nav>
          <Link to={access.to} className="pressable inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-brand-ink px-4 text-sm font-bold text-nav hover:bg-brand-soft">
            <Icon name="user" className="h-4 w-4" />
            {access.label}
          </Link>
        </div>
      </header>

      <main id="inicio">
        {/* ---------- Portada ---------- */}
        <section
          id="ecosistema"
          className="relative overflow-hidden bg-nav text-brand-ink"
          style={{ backgroundImage: 'radial-gradient(ellipse at 10% 15%, oklch(var(--nav-active) / 0.9), transparent 55%)' }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
            <div>
              <p data-reveal style={delay(0)} className="text-xs font-bold uppercase tracking-[0.24em] text-nav-ink">Ecosistema de negocios</p>
              <h1 data-reveal style={delay(1)} className="mt-4 text-[clamp(2.25rem,5.2vw,4rem)] font-extrabold leading-[1.02] [font-stretch:112%]">
                Unimos a los dueños del capital con los emprendedores.
              </h1>
              <p data-reveal style={delay(2)} className="mt-6 max-w-[46ch] text-lg leading-relaxed text-nav-ink">
                Desarrollando así la más rentable y sustentable incubadora de negocios: transporte, movilidad, alimentos y bienes raíces.
              </p>
              <div data-reveal style={delay(3)} className="mt-9 flex flex-wrap items-center gap-3">
                <a href="#inversiones" className="pressable inline-flex min-h-[48px] items-center rounded-lg bg-brand-ink px-6 font-bold text-nav hover:bg-brand-soft">
                  Ver opciones de inversión
                </a>
                <Link to={access.to} className="pressable inline-flex min-h-[48px] items-center gap-2 rounded-lg px-4 font-semibold text-brand-ink underline-offset-4 hover:underline">
                  <Icon name="user" className="h-4 w-4" /> {access.label}
                </Link>
              </div>
            </div>
            <figure data-reveal style={delay(2)} className="relative">
              <img
                src="/landing/hero-reunion.jpg"
                alt="Equipo de Verticimax presentando un proyecto de negocio"
                className="aspect-[5/4] w-full rounded-2xl object-cover shadow-2xl"
              />
              <figcaption className="absolute -bottom-7 left-6 right-6 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface text-ink shadow-xl sm:left-auto sm:w-[22rem]">
                {[
                  ['4', 'ramos de negocio'],
                  ['MXN · USD', 'monedas'],
                  ['25 %', 'tasa máx. anual']
                ].map(([v, l]) => (
                  <span key={l} className="px-3 py-3 text-center">
                    <span className="figure block text-lg font-extrabold text-brand">{v}</span>
                    <span className="block text-[11px] leading-tight text-ink-muted">{l}</span>
                  </span>
                ))}
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ---------- Ramos de negocios (composición asimétrica) ---------- */}
        <section id="ramos" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 pt-24 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
            <div data-reveal>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">Dónde invertimos</p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">Ramos de negocios reales, que puedes ver y entender.</h2>
              <p className="mt-4 max-w-[42ch] text-ink-2">
                Tu capital impulsa empresas en operación: unidades de transporte, movilidad urbana, restaurantes y desarrollos.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article data-reveal style={delay(0)} className="group relative overflow-hidden rounded-2xl sm:row-span-2">
                <img src="/landing/ramo-transporte.jpg" alt="" loading="lazy" className="h-64 w-full object-cover sm:h-full" />
                <RamoLabel title="Transporte" detail="Movilidad personal · Transporte público · Transporte de carga" />
              </article>
              <article data-reveal style={delay(1)} className="relative overflow-hidden rounded-2xl">
                <img src="/landing/ramo-alimentos.jpg" alt="" loading="lazy" className="h-48 w-full object-cover" />
                <RamoLabel title="Alimentos" detail="Fast food" />
              </article>
              <article data-reveal style={delay(2)} className="relative overflow-hidden rounded-2xl">
                <img src="/landing/ramo-bienes-raices.jpg" alt="" loading="lazy" className="h-48 w-full object-cover" />
                <RamoLabel title="Bienes raíces" detail="Desarrollos inmobiliarios · Desarrollos turísticos" />
              </article>
            </div>
          </div>
        </section>

        {/* ---------- Opciones: tablero de tasas ---------- */}
        <section id="inversiones" className="scroll-mt-20 bg-nav py-20 text-brand-ink">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div data-reveal className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-nav-ink">Opciones</p>
                <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">Giros en los que apalancamos tu inversión</h2>
              </div>
              <p className="max-w-[36ch] text-sm text-nav-ink">Invierte en pesos mexicanos o en dólares. CETES, solo en pesos.</p>
            </div>

            <ul className="mt-10 divide-y divide-white/10 border-y border-white/10" aria-label="Opciones de inversión">
              {OPCIONES.map((o, i) => (
                <li
                  key={o.name}
                  data-reveal
                  style={delay(i)}
                  className="grid grid-cols-[64px_1fr_auto] items-center gap-x-4 gap-y-3 py-5 sm:grid-cols-[88px_1.2fr_1fr_13rem] sm:gap-x-8"
                >
                  {o.img ? (
                    <img src={o.img} alt="" loading="lazy" className="h-16 w-16 rounded-xl object-cover sm:h-[72px] sm:w-[88px]" />
                  ) : (
                    <span aria-hidden className="flex h-16 w-16 items-center justify-center rounded-xl bg-nav-active sm:h-[72px] sm:w-[88px]">
                      <Icon name="chart" className="h-7 w-7 text-nav-ink" />
                    </span>
                  )}
                  <h3 className="text-lg font-bold sm:text-xl">{o.name}</h3>
                  <dl className="col-span-2 col-start-2 row-start-2 grid grid-cols-2 gap-4 text-sm sm:col-span-1 sm:col-start-3 sm:row-start-1">
                    <div>
                      <dt className="text-nav-ink">Capital</dt>
                      <dd className="figure font-semibold">{o.capital}</dd>
                    </div>
                    <div>
                      <dt className="text-nav-ink">Plazo</dt>
                      <dd className="font-semibold">{o.plazo}</dd>
                    </div>
                  </dl>
                  <p className="col-start-3 row-start-1 text-right sm:col-start-4">
                    <span className="figure block text-3xl font-extrabold leading-none sm:text-4xl">{o.tasa}</span>
                    <span className="mt-1 block text-xs text-nav-ink">{o.nota}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Cobro: secuencia numerada ---------- */}
        <section id="cobro" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div data-reveal>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">Tú decides</p>
            <h2 className="mt-3 max-w-[22ch] text-3xl font-extrabold leading-tight sm:text-4xl">Al cobrar tus rendimientos, puedes hacerlo así:</h2>
          </div>
          <ol className="relative mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            <span aria-hidden className="absolute left-0 right-0 top-5 hidden h-px bg-line lg:block" />
            {COBRO.map((c, i) => (
              <li key={c.title} data-reveal style={delay(i)} className="relative">
                <span className="figure relative flex h-10 w-10 items-center justify-center rounded-full bg-nav text-base font-extrabold text-brand-ink ring-8 ring-page">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-bold">{c.title}</h3>
                <p className="mt-1 text-ink-2">{c.text}</p>
              </li>
            ))}
          </ol>
          <p data-reveal className="mt-10 max-w-[60ch] text-ink-2">Según tu contrato, también puedes reinvertir tus rendimientos para hacer crecer tu capital.</p>
        </section>

        {/* ---------- Socios capital: editorial ---------- */}
        <section id="socios" className="scroll-mt-20 border-t border-line bg-surface py-20">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.3fr_1fr]">
            <figure data-reveal>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-brand">Socios capital</p>
              <blockquote className="font-display mt-5 text-2xl font-semibold leading-snug text-ink sm:text-3xl">
                <span aria-hidden className="text-accent">“</span>
                {SOCIOS[0]!.quote}
                <span aria-hidden className="text-accent">”</span>
              </blockquote>
              <figcaption className="mt-5 text-ink-2">
                <strong className="text-ink">{SOCIOS[0]!.name}</strong> · {SOCIOS[0]!.role}
              </figcaption>
            </figure>
            <div className="space-y-8 lg:border-l lg:border-line lg:pl-10">
              {SOCIOS.slice(1).map((s, i) => (
                <figure key={s.name} data-reveal style={delay(i + 1)}>
                  <blockquote className="text-lg leading-relaxed text-ink-2">“{s.quote}”</blockquote>
                  <figcaption className="mt-2 text-sm">
                    <strong className="text-ink">{s.name}</strong> <span className="text-ink-muted">· {s.role}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Llamado a la acción ---------- */}
        <section className="bg-nav text-brand-ink">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold sm:text-3xl">¿Ya eres inversionista?</h2>
              <p className="mt-1 text-nav-ink">Consulta tu capital, rendimientos y pagos en tu portal privado.</p>
            </div>
            <Link to={access.to} className="pressable inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-brand-ink px-6 font-bold text-nav hover:bg-brand-soft">
              <Icon name="user" className="h-4 w-4" /> {access.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-page">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-ink-muted sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <img src={BRAND.emblemSrc} alt="" className="h-7 w-auto" />
              <span className="font-semibold text-ink">Verticimax México Star Up</span>
            </span>
            <span>© {new Date().getFullYear()} Verticimax México Star Up</span>
          </div>
          <p className="mt-5 max-w-[80ch] text-xs leading-relaxed">
            Las tasas, plazos y capitales mostrados son de referencia; las condiciones definitivas se establecen en cada contrato.
            Los testimonios reflejan experiencias individuales; los rendimientos pasados no garantizan rendimientos futuros.
            Toda inversión conlleva riesgos.
          </p>
        </div>
      </footer>
    </div>
  );
}

function RamoLabel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-nav via-nav/80 to-transparent p-5 pt-12 text-brand-ink">
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="mt-0.5 text-sm text-nav-ink">{detail}</p>
    </div>
  );
}
