import type { CSSProperties } from 'react';
import type { MarketIndicator } from '../api/types';
import { formatDate } from '../lib/format';
import { useMarket } from './MarketIndicators';
import { cx } from './ui';

const value = (i: MarketIndicator) => (i.kind === 'fx' ? `$${i.value}` : i.kind === 'rate' ? `${i.value} %` : i.value);

const ARROW = { up: '▲', down: '▼', flat: '=' } as const;
const DIR_LABEL = { up: 'sube', down: 'baja', flat: 'sin cambio' } as const;

function Item({ i }: { i: MarketIndicator }) {
  return (
    <li className="flex shrink-0 items-baseline gap-2 whitespace-nowrap" title={`${i.label}: dato del ${formatDate(i.date)} · Banxico ${i.series_id}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-on-band-2">{i.label}</span>
      <span className="figure text-sm font-bold text-on-band">{value(i)}</span>
      {i.direction && i.change && (
        <span className={cx('figure text-xs font-semibold', i.direction === 'up' ? 'ticker-up' : i.direction === 'down' ? 'ticker-down' : 'text-on-band-2')}>
          <span aria-hidden>{ARROW[i.direction]} </span>
          <span className="sr-only">{DIR_LABEL[i.direction]} </span>
          {i.change}
          {i.kind === 'rate' ? ' pts' : ''}
        </span>
      )}
    </li>
  );
}

/**
 * Cinta de indicadores de Banco de México (divisas, UDIS, tasas, CETES e inflación).
 * Movimiento constante → lineal (Emil Kowalski); se pausa al pasar el mouse o con el foco del teclado,
 * y con "reducir movimiento" queda fija y desplazable. Si Banxico no está disponible, no aparece.
 */
export function MarketTicker({ className }: { className?: string }) {
  const m = useMarket().data;
  if (!m?.available || m.indicators.length === 0) return null;
  const items = m.indicators;
  // ~4.5 s por indicador: lectura cómoda sin que parezca detenida
  const style = { '--ticker-duration': `${Math.max(30, items.length * 4.5)}s` } as CSSProperties;

  return (
    <section aria-label="Indicadores de Banco de México" className={cx('ticker band border-b border-band-line bg-band text-on-band', className)}>
      <div className="flex items-center">
        <span className="shrink-0 border-r border-band-line px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-on-band-accent">
          Banxico{m.stale && <span className="sr-only"> (último dato disponible)</span>}
        </span>
        <div className="ticker-viewport min-w-0 flex-1 overflow-hidden py-2" tabIndex={0} role="group" aria-label="Indicadores en movimiento; se detienen con el foco">
          <div className="ticker-track" style={style}>
            <ul className="ticker-group">
              {items.map((i) => (
                <Item key={i.key} i={i} />
              ))}
            </ul>
            {/* Copia para el desplazamiento continuo; los lectores de pantalla la ignoran */}
            <ul className="ticker-group" aria-hidden>
              {items.map((i) => (
                <Item key={i.key} i={i} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
