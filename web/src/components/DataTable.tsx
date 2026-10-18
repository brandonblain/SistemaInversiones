import type { ReactNode } from 'react';
import type { Pagination as PaginationInfo } from '../api/types';
import { Icon } from './icons';
import { cx, EmptyState } from './ui';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'left' | 'right';
  /** Ocultar en pantallas pequeñas (la vista móvil usa tarjetas). */
  hideOnMobile?: boolean;
  /** Columna principal en la tarjeta móvil. */
  primary?: boolean;
}

/**
 * Tabla accesible: en escritorio es <table>; en móvil cada fila se vuelve tarjeta con etiquetas.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  empty,
  onRowClick
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Sin registros" />}</>;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cx('px-3 py-2 font-semibold', c.align === 'right' && 'text-right')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-sunken')}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-3 py-3 align-top', c.align === 'right' && 'tabular text-right')}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => {
          const primary = columns.find((c) => c.primary) ?? columns[0]!;
          return (
            <li key={rowKey(row)} className="rounded-lg border border-line bg-surface p-3">
              <div className="mb-2 font-semibold text-ink">{primary.render(row)}</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                {columns
                  .filter((c) => c !== primary && !c.hideOnMobile)
                  .map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-xs text-ink-muted">{c.header}</dt>
                      <dd className={cx('break-words text-ink', c.align === 'right' && 'tabular')}>{c.render(row)}</dd>
                    </div>
                  ))}
              </dl>
              {onRowClick && (
                <button type="button" onClick={() => onRowClick(row)} className="mt-3 min-h-[44px] w-full rounded-lg border border-line text-sm font-semibold text-brand">
                  Ver detalle
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Pagination({ info, onPage }: { info: PaginationInfo; onPage: (page: number) => void }) {
  if (info.totalPages <= 1) {
    return info.total > 0 ? <p className="mt-3 text-xs text-ink-muted">{info.total} registro{info.total === 1 ? '' : 's'}</p> : null;
  }
  return (
    <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-2 text-sm">
      <p className="text-ink-muted">
        Página {info.page} de {info.totalPages} · {info.total} registros
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
          onClick={() => onPage(info.page - 1)}
          disabled={info.page <= 1}
          aria-label="Página anterior"
        >
          <Icon name="chevronLeft" />
        </button>
        <button
          type="button"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-line bg-surface disabled:opacity-40"
          onClick={() => onPage(info.page + 1)}
          disabled={info.page >= info.totalPages}
          aria-label="Página siguiente"
        >
          <Icon name="chevronRight" />
        </button>
      </div>
    </nav>
  );
}
