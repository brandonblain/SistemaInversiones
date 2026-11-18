import { api } from '../api';
import type { MarketSnapshot } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { formatDate } from '../lib/format';
import { Card, cx } from './ui';

/**
 * Indicadores públicos de Banxico (cinta y panel). Informativos: no cambian saldos ni contratos.
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

// Panel: FIX más los indicadores de la cinta que no son divisas (UDIS, tasa objetivo, TIIE e inflación)
const PANEL_KEYS = ['UDIS', 'OBJETIVO', 'TIIE28', 'INFLACION'];

function Cell({ label, value, detail, className }: { label: string; value: string; detail: string; className?: string }) {
  return (
    <div className={cx('bg-surface p-4', className)}>
      <dt className="text-sm font-medium text-ink-2">{label}</dt>
      <dd className="figure mt-1 text-xl font-bold text-ink sm:text-2xl">{value}</dd>
      <dd className="mt-0.5 text-xs text-ink-muted">{detail}</dd>
    </div>
  );
}

/**
 * Panel de indicadores de Banxico para las cuentas de clientes y el resumen de administración.
 * Si Banxico no está disponible, el panel del cliente simplemente no aparece.
 */
export function MarketIndicators({ variant, className }: { variant: 'investor' | 'admin'; className?: string }) {
  const market = useMarket();
  const m = market.data;

  if (!m?.available) {
    if (variant === 'admin' && !market.loading) {
      return (
        <Card className={className} title="Indicadores de Banco de México">
          <p className="text-sm text-ink-2">Sin datos de Banxico por ahora. Revise que el secreto <code>BANXICO_TOKEN</code> esté configurado.</p>
        </Card>
      );
    }
    return null;
  }

  const cells = [
    m.fx && <Cell key="fx" label="Tipo de cambio FIX" value={formatFx(m.fx.rate)} detail={`pesos por dólar · ${formatDate(m.fx.date)}`} />,
    ...PANEL_KEYS.map((key) => {
      const i = m.indicators.find((x) => x.key === key);
      return i && <Cell key={key} label={i.label} value={i.kind === 'rate' ? `${i.value} %` : i.value} detail={`dato del ${formatDate(i.date)}`} />;
    })
  ].filter(Boolean);

  const note = `Fuente: ${m.source}.${m.stale ? ' Último dato disponible: Banxico no respondió en la última consulta.' : ''}`;

  return (
    <Card className={className} title="Indicadores de Banco de México">
      <dl className="metric-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">{cells}</dl>
      <p className="mt-3 text-xs text-ink-muted">
        {variant === 'investor' ? 'Referencia informativa: no modifica sus saldos ni las condiciones de su contrato. ' : 'Dato en vivo, informativo. '}
        {note}
      </p>
    </Card>
  );
}
