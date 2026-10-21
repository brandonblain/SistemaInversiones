import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { Alert, cx, EmptyState, LinkButton } from '../../components/ui';
import { BRAND } from '../../layouts/brand';
import { DRAFT, LEGAL_DOCS, legalDoc, type Block, type LegalDoc } from '../../legal/documents';

/** Resalta los datos por completar: todo lo que va entre [corchetes]. */
function withPlaceholders(text: string): ReactNode {
  return text.split(/(\[[^\]]+\])/g).map((part, i) =>
    /^\[[^\]]+\]$/.test(part) ? (
      <mark key={i} className="legal-placeholder">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function BlockView({ b }: { b: Block }) {
  if (typeof b === 'string') return <p>{withPlaceholders(b)}</p>;
  if ('list' in b)
    return (
      <ul className="list-disc space-y-1.5 pl-5 marker:text-ink-muted">
        {b.list.map((li, i) => (
          <li key={i}>{withPlaceholders(li)}</li>
        ))}
      </ul>
    );
  if ('callout' in b)
    return <p className="rounded-lg border-l-0 bg-sunken px-4 py-3 font-semibold text-ink">{withPlaceholders(b.callout)}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <thead className="bg-sunken text-ink">
          <tr>
            {b.table.head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {b.table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className={cx('px-3 py-2 align-top', c === 0 && 'font-medium text-ink')}>
                  {withPlaceholders(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site min-h-screen bg-page text-ink">
      <header className="band border-b border-band-line bg-band">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-h-[44px] items-center gap-3" aria-label={`${BRAND.name}, inicio`}>
            <img src={BRAND.logoSrc} alt="" width={56} height={40} className="h-10 w-auto" />
            <span className="hidden text-sm font-semibold text-on-band-2 sm:block">Documentos legales</span>
          </Link>
          <Link to="/" className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-semibold text-on-band hover:bg-band-raised">
            Volver al inicio
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">{children}</main>
      <footer className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-ink-2 sm:px-6">© {new Date().getFullYear()} {BRAND.legalName}</p>
      </footer>
    </div>
  );
}

const GROUPS: Array<{ key: LegalDoc['group']; title: string }> = [
  { key: 'sitio', title: 'Sitio, privacidad y atención' },
  { key: 'inversionistas', title: 'Para clientes (modelos de contrato)' }
];

function DraftNotice() {
  if (!DRAFT) return null;
  return (
    <Alert tone="warn" title="Borrador pendiente de revisión legal">
      Los textos <mark className="legal-placeholder">[entre corchetes]</mark> son datos por completar o decisiones por confirmar. Un abogado debe revisar y aprobar este
      documento antes de considerarlo vigente.
    </Alert>
  );
}

export function LegalIndexPage() {
  useEffect(() => {
    document.title = `Documentos legales · ${BRAND.name}`;
  }, []);
  return (
    <LegalLayout>
      <h1 className="text-3xl font-extrabold sm:text-4xl">Documentos legales</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">Políticas, avisos y modelos de contrato que rigen el uso del sitio y la relación con nuestros clientes.</p>
      <div className="mt-6">
        <DraftNotice />
      </div>
      {GROUPS.map((g) => (
        <section key={g.key} className="mt-10" aria-labelledby={`grupo-${g.key}`}>
          <h2 id={`grupo-${g.key}`} className="text-lg font-bold text-ink">
            {g.title}
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {LEGAL_DOCS.filter((d) => d.group === g.key).map((d) => (
              <li key={d.slug}>
                <Link to={`/legal/${d.slug}`} className="pressable block h-full rounded-card border border-line bg-surface p-5 hover:border-brand">
                  <span className="block font-semibold text-ink">{d.title}</span>
                  <span className="mt-1 block text-sm text-ink-2">{d.summary}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </LegalLayout>
  );
}

export function LegalDocPage() {
  const { slug } = useParams();
  const doc = legalDoc(slug);
  useEffect(() => {
    document.title = doc ? `${doc.short} · ${BRAND.name}` : `Documento no encontrado · ${BRAND.name}`;
  }, [doc]);

  if (!doc) {
    return (
      <LegalLayout>
        <EmptyState title="Documento no encontrado" action={<LinkButton to="/legal">Ver documentos legales</LinkButton>} />
      </LegalLayout>
    );
  }

  return (
    <LegalLayout>
      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Documentos legales" className="order-last lg:order-first">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-2">Documentos</p>
          <ul className="mt-3 space-y-1 text-sm">
            {LEGAL_DOCS.map((d) => (
              <li key={d.slug}>
                <NavLink
                  to={`/legal/${d.slug}`}
                  className={({ isActive }) =>
                    cx('flex min-h-[40px] items-center rounded-lg px-3', isActive ? 'bg-brand-soft font-semibold text-brand' : 'text-ink-2 hover:bg-sunken hover:text-ink')
                  }
                >
                  {d.short}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <article className="min-w-0 max-w-[72ch]">
          <p className="text-sm font-semibold text-brand">
            <Link to="/legal" className="hover:underline">
              Documentos legales
            </Link>
          </p>
          <h1 className="mt-2 text-balance text-3xl font-extrabold leading-tight sm:text-4xl">{doc.title}</h1>
          <p className="mt-3 text-lg text-ink-2">{doc.summary}</p>
          <div className="mt-6">
            <DraftNotice />
          </div>
          <div className="mt-8 space-y-10">
            {doc.sections.map((s) => (
              <section key={s.title}>
                <h2 className="text-xl font-bold text-ink">{s.title}</h2>
                <div className="mt-3 space-y-3 leading-relaxed text-ink-2">
                  {s.blocks.map((b, i) => (
                    <BlockView key={i} b={b} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </LegalLayout>
  );
}
