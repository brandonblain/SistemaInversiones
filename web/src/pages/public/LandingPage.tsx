import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { homeFor } from '../../auth/RequireRole';
import { Icon, type IconName } from '../../components/icons';
import { BRAND } from '../../layouts/brand';

// Contenido tomado del material comercial de Verticimax México Star Up.
// Tasas, plazos y capitales son condiciones de referencia; cada contrato fija las definitivas.

const NAV = [
  { href: '#ecosistema', label: 'Ecosistema' },
  { href: '#ramos', label: 'Ramos' },
  { href: '#inversiones', label: 'Inversiones' },
  { href: '#cobro', label: 'Rendimientos' },
  { href: '#socios', label: 'Socios capital' }
];

const RAMOS = [
  { title: 'Alimentos', detail: 'Fast food', img: '/landing/ramo-alimentos.jpg' },
  { title: 'Bienes raíces', detail: 'Desarrollos inmobiliarios · Desarrollos turísticos', img: '/landing/ramo-bienes-raices.jpg' },
  { title: 'Transporte', detail: 'Movilidad personal · Transporte público · Transporte de carga', img: '/landing/ramo-transporte.jpg' }
];

const OPCIONES = [
  { name: 'Movilidad', capital: '$250,000.00', plazo: '12 meses', tasa: '16 %', tasaNota: 'anual fija', img: '/landing/ramo-movilidad.jpg' },
  { name: 'Transporte', capital: '$400,000.00', plazo: '18 meses', tasa: '25 %', tasaNota: 'anual fija', img: '/landing/ramo-transporte.jpg' },
  { name: 'Fast Food', capital: '$100,000.00', plazo: '12 meses', tasa: '13 %', tasaNota: 'anual fija', img: '/landing/ramo-alimentos.jpg' }
];

const COBRO: Array<{ title: string; text: string; icon: IconName }> = [
  { title: 'Mensual', text: 'Recibe tus rendimientos cada mes.', icon: 'clock' },
  { title: 'Semestral', text: 'Cobra cada seis meses.', icon: 'chart' },
  { title: 'Anual', text: 'Un cobro al año sobre tu capital.', icon: 'percent' },
  { title: 'A liquidación', text: 'Recibe tus rendimientos al terminar el contrato.', icon: 'check' }
];

const SOCIOS = [
  { name: 'Héctor Galeana', quote: 'Llevo 4 años con este producto financiero y he logrado duplicar mi capital.' },
  { name: 'Cesar Daniel', quote: 'Con mi inversión, en dos años logré pagar las mensualidades de mi crédito de auto.' },
  { name: 'Victoria Pérez', quote: 'Como jubilada he logrado crear un ingreso pasivo mensual incrementando mi pensión. Es como si tuviera dos sueldos.' }
];

const initials = (n: string) => n.split(' ').map((p) => p[0]).slice(0, 2).join('');

export function LandingPage() {
  const { session } = useAuth();
  const access = session ? { to: homeFor(session.user.role), label: 'Ir a mi portal' } : { to: '/login', label: 'Acceso clientes' };

  useEffect(() => {
    document.title = 'Verticimax México Star Up · Ecosistema de negocios';
  }, []);

  return (
    <div className="min-h-screen bg-surface text-ink">
      {/* ---------- Encabezado ---------- */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-nav/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#inicio" className="flex items-center gap-2.5" aria-label="Verticimax México Star Up, inicio">
            <img src={BRAND.emblemSrc} alt="" className="h-10 w-auto" />
            <span className="leading-tight">
              <span className="block text-base font-extrabold tracking-wide text-white">VERTICIMAX</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-nav-ink">México · Star Up</span>
            </span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-6 lg:flex">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="text-sm font-medium text-nav-ink transition hover:text-white">{n.label}</a>
            ))}
          </nav>
          <Link
            to={access.to}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-nav shadow-sm transition hover:bg-brand-soft"
          >
            <Icon name="user" className="h-4 w-4" />
            {access.label}
          </Link>
        </div>
      </header>

      <main id="inicio">
        {/* ---------- Portada ---------- */}
        <section
          id="ecosistema"
          className="relative overflow-hidden bg-nav text-white"
          style={{ backgroundImage: 'radial-gradient(ellipse at 15% 20%, rgb(var(--nav-active) / 0.95), transparent 55%)' }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-nav-ink">Ecosistema de negocios</p>
              <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
                Unimos a los dueños del capital con los emprendedores
              </h1>
              <p className="mt-5 max-w-xl text-lg text-nav-ink">
                Desarrollando así la más rentable y sustentable incubadora de negocios.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#inversiones" className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-white px-6 font-bold text-nav transition hover:bg-brand-soft">
                  Ver opciones de inversión
                </a>
                <Link to={access.to} className="inline-flex min-h-[48px] items-center gap-2 rounded-lg border border-white/40 px-6 font-semibold text-white transition hover:bg-white/10">
                  <Icon name="user" className="h-4 w-4" /> {access.label}
                </Link>
              </div>
            </div>
            <div className="relative">
              <img
                src="/landing/hero-reunion.jpg"
                alt="Equipo de Verticimax presentando un proyecto de negocio"
                className="aspect-[4/3] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/20"
              />
              <img src={BRAND.plateSrc} alt="" className="absolute -bottom-6 -left-4 hidden w-40 rounded-xl shadow-xl ring-4 ring-nav sm:block" />
            </div>
          </div>
        </section>

        {/* ---------- Datos clave ---------- */}
        <section aria-label="Características" className="border-b border-line bg-brand-soft/60">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-8 sm:px-6 lg:grid-cols-4">
            {[
              ['percent', 'Tasa anual fija', 'o referida a CETES'],
              ['cash', 'Pesos o dólares', 'Elige la moneda de tu inversión'],
              ['clock', 'Cobro flexible', 'Mensual, semestral, anual o a liquidación'],
              ['shield', 'Portal privado', 'Consulta tus rendimientos y pagos']
            ].map(([icon, title, text]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="rounded-lg bg-nav p-2 text-white"><Icon name={icon as IconName} /></span>
                <span>
                  <span className="block font-bold text-ink">{title}</span>
                  <span className="block text-sm text-ink-2">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Ramos de negocios ---------- */}
        <section id="ramos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <SectionTitle eyebrow="Dónde invertimos" title="Ramos de negocios" />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {RAMOS.map((r) => (
              <article key={r.title} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <img src={r.img} alt="" className="h-44 w-full object-cover" loading="lazy" />
                <div className="p-5">
                  <h3 className="text-lg font-bold text-ink">{r.title}</h3>
                  <p className="mt-1 text-sm text-ink-2">{r.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- Opciones de inversión ---------- */}
        <section id="inversiones" className="scroll-mt-20 bg-nav py-16 text-white">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle eyebrow="Opciones" title="Giros en los que apalancamos tu inversión" dark />
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {OPCIONES.map((o) => (
                <article key={o.name} className="flex flex-col overflow-hidden rounded-2xl bg-surface text-ink shadow-xl">
                  <div className="flex h-36 items-center justify-center bg-gradient-to-br from-nav-active to-nav">
                    <img src={o.img} alt="" className="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="text-xl font-extrabold text-nav">{o.name}</h3>
                    <p className="mt-3 text-4xl font-extrabold text-ink">{o.tasa}</p>
                    <p className="text-sm text-ink-muted">{o.tasaNota}</p>
                    <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
                      <div className="flex justify-between"><dt className="text-ink-muted">Capital</dt><dd className="font-semibold">{o.capital}</dd></div>
                      <div className="flex justify-between"><dt className="text-ink-muted">Plazo</dt><dd className="font-semibold">{o.plazo}</dd></div>
                    </dl>
                  </div>
                </article>
              ))}
              <article className="flex flex-col overflow-hidden rounded-2xl bg-surface text-ink shadow-xl">
                <div className="flex h-36 flex-col items-center justify-center bg-gradient-to-br from-nav-active to-nav text-white">
                  <Icon name="chart" className="h-10 w-10" />
                  <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-nav-ink">Inversión en pesos</span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-xl font-extrabold text-nav">CETES</h3>
                  <p className="mt-3 text-4xl font-extrabold text-ink">CETES − 1</p>
                  <p className="text-sm text-ink-muted">punto · tasa referida a CETES</p>
                  <p className="mt-4 border-t border-line pt-3 text-sm text-ink-2">
                    Tu rendimiento sigue la tasa de los Certificados de la Tesorería, menos un punto.
                  </p>
                </div>
              </article>
            </div>
            <p className="mt-6 text-sm text-nav-ink">Disponible en pesos mexicanos o dólares estadounidenses (CETES solo en pesos).</p>
          </div>
        </section>

        {/* ---------- Cobro de rendimientos ---------- */}
        <section id="cobro" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
          <SectionTitle eyebrow="Tú decides" title="Al cobrar tus rendimientos, puedes hacerlo de las siguientes formas" />
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {COBRO.map((c, i) => (
              <li key={c.title} className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-nav text-lg font-extrabold text-white">{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold text-ink">{c.title}</h3>
                <p className="mt-1 text-sm text-ink-2">{c.text}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-ink-2">Según tu contrato, también puedes reinvertir tus rendimientos para hacer crecer tu capital.</p>
        </section>

        {/* ---------- Socios capital ---------- */}
        <section id="socios" className="scroll-mt-20 bg-sunken py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionTitle eyebrow="Testimonios" title="Socios capital" />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {SOCIOS.map((s) => (
                <figure key={s.name} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-sm">
                  <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full bg-nav text-lg font-bold text-white">{initials(s.name)}</span>
                  <blockquote className="mt-4 flex-1 text-ink-2">“{s.quote}”</blockquote>
                  <figcaption className="mt-4 font-bold text-ink">{s.name}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Llamado a la acción ---------- */}
        <section className="bg-nav text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-extrabold">¿Ya eres inversionista?</h2>
              <p className="mt-1 text-nav-ink">Consulta tu capital, rendimientos y pagos en tu portal privado.</p>
            </div>
            <Link to={access.to} className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-white px-6 font-bold text-nav transition hover:bg-brand-soft">
              <Icon name="user" className="h-4 w-4" /> {access.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-ink-muted sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              <img src={BRAND.emblemSrc} alt="" className="h-7 w-auto" />
              <span className="font-semibold text-ink">Verticimax México Star Up</span>
            </span>
            <span>© {new Date().getFullYear()} Verticimax México Star Up</span>
          </div>
          <p className="mt-4 max-w-3xl text-xs leading-relaxed">
            Las tasas, plazos y capitales mostrados son de referencia; las condiciones definitivas se establecen en cada contrato.
            Los testimonios reflejan experiencias individuales; los rendimientos pasados no garantizan rendimientos futuros.
            Toda inversión conlleva riesgos.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({ eyebrow, title, dark = false }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className="max-w-2xl">
      <p className={`text-sm font-bold uppercase tracking-[0.2em] ${dark ? 'text-nav-ink' : 'text-brand'}`}>{eyebrow}</p>
      <h2 className={`mt-2 text-2xl font-extrabold sm:text-3xl ${dark ? 'text-white' : 'text-ink'}`}>{title}</h2>
    </div>
  );
}
