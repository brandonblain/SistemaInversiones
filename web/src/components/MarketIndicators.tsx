import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AdminSummary, MarketSnapshot, ReferenceRateCode } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatDate, formatRateBps } from '../lib/format';
import { referenceRateLabel } from '../lib/labels';
import { Badge, Card, cx } from './ui';

/**
 * Indicadores públicos de Banxico (cinta, FIX y CETES). Informativos: no cambian saldos ni contratos.
 * La cinta y los paneles de una misma página comparten una sola consulta (vigente 60 s).
 */
let shared: { at: number; promise: Promise<MarketSnapshot> } | null = null;
export function loadMarket(): Promise<MarketSnapshot> {
  if (!shared || Date.now() - shared.at > 60_000) {
    const promise = api.public.market().catch((e) => {
      shared = null;
      throw e;
    });
    shared = { at: Date.now(), promise };
  }
  return shared.promise;
}
/** Solo para pruebas. */
export const resetMarketCache = () => {
  shared = null;
};
export function useMarket() {
  return useAsync<MarketSnapshot>(loadMarket, []);
}

/** "18.4253" → "$18.4253" (el FIX se publica con 4 decimales). */
export const formatFx = (rate: string) => `$${rate}`;

const CODES: ReferenceRateCode[] = ['CETES_28', 'CETES_91', 'CETES_182', 'CETES_364'];

function Cell({ label, value, detail, extra, className }: { label: string; value: string; detail: string; extra?: ReactNode; className?: string }) {
  return (
    <div className={cx('bg-surface p-4', className)}>
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className="figure mt-1 text-xl font-bold text-ink sm:text-2xl">{value}</dd>
      <dd className="mt-0.5 text-xs text-ink-muted">{detail}</dd>
      {extra && <dd className="mt-2">{extra}</dd>}
    </div>
  );
}

/**
 * Panel de indicadores para las cuentas de clientes (FIX y CETES 28) y para el resumen de administración
 * (FIX y los cuatro plazos, con aviso cuando Banxico publicó una tasa que aún no se importa).
 * Si Banxico no está disponible, el panel del cliente simplemente no aparece.
 */
export function MarketIndicators({ variant, systemRates, className }: { variant: 'investor' | 'admin'; systemRates?: AdminSummary['reference_rates']; className?: string }) {
  const market = useMarket();
  const m = market.data;

  if (!m?.available) {
    if (variant === 'admin' && !market.loading) {
      return (
        <Card className={className} title="Indicadores de Banco de México">
          <p className="text-sm text-ink-2">
            Sin datos de Banxico por ahora. Revise que el secreto <code>BANXICO_TOKEN</code> esté configurado; la captura manual de tasas sigue disponible.
          </p>
        </Card>
      );
    }
    return null;
  }

  const latestSystem = new Map((systemRates ?? []).map((r) => [r.rate_code, r.effective_date]));
  const cetesCodes = variant === 'admin' ? CODES : (['CETES_28'] as ReferenceRateCode[]);
  const cells = [
    m.fx && <Cell key="fx" label="Tipo de cambio FIX" value={formatFx(m.fx.rate)} detail={`pesos por dólar · ${formatDate(m.fx.date)}`} />,
    ...cetesCodes.map((code) => {
      const c = m.cetes[code];
      if (!c) return null;
      const pendingImport = variant === 'admin' && (!latestSystem.get(code) || latestSystem.get(code)! < c.date);
      return (
        <Cell
          key={code}
          label={referenceRateLabel[code]}
          value={formatRateBps(c.annual_rate_bps)}
          detail={`subasta del ${formatDate(c.date)}`}
          extra={
            pendingImport ? (
              <Link to="/admin/tasas" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
                <Badge tone="info">Nueva en Banxico</Badge> Importar
              </Link>
            ) : undefined
          }
        />
      );
    })
  ].filter(Boolean);

  const note = `Fuente: ${m.source}.${m.stale ? ' Último dato disponible: Banxico no respondió en la última consulta.' : ''}`;

  return (
    <Card
      className={className}
      title="Indicadores de Banco de México"
      actions={variant === 'admin' ? <Link to="/admin/tasas" className="text-sm font-semibold text-brand hover:underline">Importar tasas</Link> : undefined}
    >
      <dl className={cx('metric-grid grid-cols-1 sm:grid-cols-2', variant === 'admin' && 'lg:grid-cols-5')}>{cells}</dl>
      <p className="mt-3 text-xs text-ink-muted">
        {variant === 'investor' ? 'Referencia informativa: no modifica sus saldos ni las condiciones de su contrato. ' : 'Dato en vivo (informativo); los cálculos usan las tasas importadas o capturadas. '}
        {note}
      </p>
    </Card>
  );
}
