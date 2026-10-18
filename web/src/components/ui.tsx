import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { Icon, type IconName } from './icons';

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

// ---------- Botones ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-strong',
  secondary: 'border border-line bg-surface text-ink hover:bg-sunken',
  danger: 'bg-bad text-white hover:opacity-90',
  ghost: 'text-ink-2 hover:bg-sunken'
};

export function Button({
  variant = 'primary',
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: IconName }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className
      )}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/** Enlace con apariencia de botón (evita anidar <button> dentro de <a>). */
export function LinkButton({ to, variant = 'primary', icon, children }: { to: string; variant?: Variant; icon?: IconName; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cx(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        variants[variant]
      )}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </Link>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ---------- Contenedores ----------
export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('rounded-card border border-line bg-surface shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={padded ? 'p-4 sm:p-5' : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Indicadores ----------
export function KpiTile({ label, value, help, tone = 'default', testId }: { label: string; value: ReactNode; help?: string; tone?: 'default' | 'brand' | 'attention'; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className={cx(
        'rounded-card border p-4',
        tone === 'brand' && 'border-brand/30 bg-brand-soft',
        tone === 'attention' && 'border-warn/40 bg-warn-soft',
        tone === 'default' && 'border-line bg-surface'
      )}
    >
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className="mt-1 text-xl font-bold text-ink sm:text-2xl">{value}</dd>
      {help && <p className="mt-1 text-xs leading-snug text-ink-muted">{help}</p>}
    </div>
  );
}

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'brand';
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info',
  brand: 'bg-brand-soft text-brand'
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}

// ---------- Estados ----------
export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: ReactNode; children?: ReactNode }) {
  const icon: IconName = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert';
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg border p-3 text-sm', {
      info: 'border-info/30 bg-info-soft text-ink',
      warn: 'border-warn/40 bg-warn-soft text-ink',
      bad: 'border-bad/40 bg-bad-soft text-ink',
      ok: 'border-ok/30 bg-ok-soft text-ink'
    }[tone])}>
      <Icon name={icon} className={cx('mt-0.5 h-5 w-5 shrink-0', { info: 'text-info', warn: 'text-warn', bad: 'text-bad', ok: 'text-ok' }[tone])} />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 text-ink-2' : undefined}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon = 'info', action }: { title: string; children?: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="rounded-full bg-sunken p-3 text-ink-muted"><Icon name={icon} className="h-6 w-6" /></span>
      <p className="font-semibold text-ink">{title}</p>
      {children && <p className="max-w-md text-sm text-ink-2">{children}</p>}
      {action}
    </div>
  );
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Ocurrió un error inesperado.';
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (error instanceof ApiError && error.code === 'MFA_SETUP_REQUIRED') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" role="alert">
        <span className="rounded-full bg-warn-soft p-3 text-warn"><Icon name="shield" className="h-6 w-6" /></span>
        <p className="font-semibold text-ink">Active la verificación en dos pasos</p>
        <p className="max-w-md text-sm text-ink-2">{error.message}</p>
        <LinkButton to="/admin/seguridad" icon="shield">Ir a Seguridad</LinkButton>
      </div>
    );
  }
  const forbidden = error instanceof ApiError && error.isForbidden;
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" role="alert">
      <span className="rounded-full bg-bad-soft p-3 text-bad"><Icon name="alert" className="h-6 w-6" /></span>
      <p className="font-semibold text-ink">
        {forbidden ? 'Sin acceso a esta información' : notFound ? 'No encontrado' : 'No se pudo cargar la información'}
      </p>
      <p className="max-w-md text-sm text-ink-2">{errorMessage(error)}</p>
      {onRetry && !forbidden && !notFound && (
        <Button variant="secondary" onClick={onRetry}>Reintentar</Button>
      )}
    </div>
  );
}

export function LoadingBlock({ label = 'Cargando…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-sunken" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-brand" role="status">
      <Spinner className="h-8 w-8" />
      <span className="sr-only">Cargando portal…</span>
    </div>
  );
}

/** Renderiza carga / error / contenido de un useAsync. */
export function Async<T>({ state, children, loading }: { state: { data: T | undefined; error: unknown; loading: boolean; reload: () => void }; children: (data: T) => ReactNode; loading?: ReactNode }) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.loading && state.data === undefined) return <>{loading ?? <LoadingBlock />}</>;
  if (state.data === undefined) return null;
  return <>{children(state.data)}</>;
}

// ---------- Formularios ----------
interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
}
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null }) {
  return <Field label={label} hint={hint} error={error}>{(p) => <input {...p} {...rest} className={cx('input', rest.className)} />}</Field>;
}

export function SelectInput({ label, hint, error, children, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => <select {...p} {...rest} className={cx('input', rest.className)}>{children}</select>}
    </Field>
  );
}

export function TextArea({ label, hint, error, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> & { label: string; hint?: ReactNode; error?: string | null }) {
  return <Field label={label} hint={hint} error={error}>{(p) => <textarea rows={3} {...p} {...rest} className={cx('input', rest.className)} />}</Field>;
}

// ---------- Listas de definición ----------
export function DefinitionList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="border-b border-line pb-2 last:border-0 sm:[&:nth-last-child(2)]:border-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{it.label}</dt>
          <dd className="mt-0.5 text-sm text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Pestañas ----------
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          onClick={() => onChange(t.id)}
          className={cx(
            'min-h-[44px] whitespace-nowrap border-b-2 px-3 text-sm font-semibold transition',
            value === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
