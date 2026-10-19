import { formatMoney } from '../lib/format';
import { kpiHelp } from '../lib/labels';
import { cx } from './ui';

export interface BalanceValues {
  capital: number;
  generated: number;
  confirmed: number;
  reinvested: number;
  paid: number;
  pending: number;
}

/**
 * Estado de cuenta en un solo panel: el capital como protagonista, los rendimientos al lado y abajo
 * cómo se reparte lo confirmado (pagado / reinvertido / pendiente) con una barra proporcional.
 * Las cifras vienen tal cual de la API; la barra solo representa proporciones visualmente.
 */
export function BalanceTiles({ v, currency = 'MXN', idPrefix = '' }: { v: BalanceValues; currency?: string; idPrefix?: string }) {
  const m = (cents: number) => formatMoney(cents, currency);
  const tid = (k: string) => `${idPrefix}kpi-${k}`;
  const unit = currency === 'USD' ? 'dólar' : 'peso';
  const parts = [
    { key: 'paid', label: 'Pagado', value: v.paid, help: kpiHelp.paid, swatch: 'bg-dist-paid' },
    { key: 'reinvested', label: 'Reinvertido', value: v.reinvested, help: kpiHelp.reinvested, swatch: 'bg-dist-reinvested' },
    { key: 'pending', label: 'Pendiente de pago', value: v.pending, help: kpiHelp.pending, swatch: 'bg-dist-pending' }
  ];
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);

  return (
    <section aria-label={`Estado de cuenta en ${currency}`} className="overflow-hidden rounded-card border border-line bg-surface">
      {/* Capital y rendimientos */}
      <div className="grid gap-x-10 gap-y-6 p-5 sm:p-7 lg:grid-cols-[1.15fr_1fr] lg:items-end">
        <dl data-testid={tid('capital')}>
          <dt className="text-sm font-medium text-ink-2">Capital vigente</dt>
          <dd className="figure mt-1 text-4xl font-extrabold leading-none text-ink sm:text-5xl">{m(v.capital)}</dd>
          <p className="mt-2 max-w-[44ch] text-sm text-ink-muted">{kpiHelp.capital}</p>
        </dl>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <div data-testid={tid('generated')}>
            <dt className="text-sm font-medium text-ink-2">Rendimiento generado</dt>
            <dd className="figure mt-1 text-xl font-bold text-ink sm:text-2xl">{m(v.generated)}</dd>
            <p className="mt-1 text-xs leading-snug text-ink-muted">{kpiHelp.generated}</p>
          </div>
          <div data-testid={tid('confirmed')}>
            <dt className="text-sm font-medium text-ink-2">Rendimiento confirmado</dt>
            <dd className="figure mt-1 text-xl font-bold text-ink sm:text-2xl">{m(v.confirmed)}</dd>
            <p className="mt-1 text-xs leading-snug text-ink-muted">{kpiHelp.confirmed}</p>
          </div>
        </dl>
      </div>

      {/* Reparto del rendimiento confirmado */}
      <div className="border-t border-line px-5 pt-5 sm:px-7">
        <h3 className="text-sm font-semibold text-ink">¿Qué pasó con el rendimiento confirmado?</h3>
        <p className="mt-0.5 text-xs text-ink-muted">Cada {unit} confirmado está en uno de estos tres estados.</p>
        <div aria-hidden className="mt-3 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-sunken">
          {total > 0 &&
            parts.map((p) =>
              p.value > 0 ? <span key={p.key} className={cx('h-full', p.swatch)} style={{ flexGrow: p.value, flexBasis: 0 }} /> : null
            )}
        </div>
      </div>
      <dl className="mt-5 grid border-t border-line sm:grid-cols-3">
        {parts.map((p, i) => (
          <div
            key={p.key}
            data-testid={tid(p.key)}
            className={cx('p-5 sm:px-7', i > 0 && 'border-t border-line sm:border-l sm:border-t-0', p.key === 'pending' && 'bg-accent-soft')}
          >
            <dt className={cx('flex items-center gap-2 text-sm font-medium', p.key === 'pending' ? 'text-accent-ink' : 'text-ink-2')}>
              <span aria-hidden className={cx('h-2.5 w-2.5 rounded-sm', p.swatch)} />
              {p.label}
            </dt>
            <dd className="figure mt-1 text-xl font-bold text-ink sm:text-2xl">{m(p.value)}</dd>
            <p className="mt-1 text-xs leading-snug text-ink-muted">{p.help}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}
