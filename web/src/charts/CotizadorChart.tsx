// Gráfica del cotizador: capital estimado mes a mes (lineal). Se carga bajo demanda (React.lazy) como las demás gráficas.

import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Cotizacion } from '../cotizador/cotizador';
import { Button } from '../components/ui';
import { formatMoney } from '../lib/format';
import { useChartTheme } from './useChartTheme';

const compact = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
/** Solo para el eje: aproximación visual; las cifras exactas están en el tooltip y en la tabla. */
const axisMoney = (cents: number) => `$${compact.format(cents / 100)}`;

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as { mes: number; capitalCents: number };
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 font-semibold text-ink">Mes {p.mes}</p>
      <p className="text-ink-2">
        Capital estimado: <span className="tabular font-semibold text-ink">{formatMoney(p.capitalCents)}</span>
      </p>
    </div>
  );
}

export default function CotizadorChart({ cotizacion }: { cotizacion: Cotizacion }) {
  const t = useChartTheme();
  const [asTable, setAsTable] = useState(false);
  const { serie, meses } = cotizacion;
  const first = serie[0]!;
  const last = serie[serie.length - 1]!;
  // Eje Y con hitos exactos: capital inicial, cuartos del crecimiento y capital final (no parte de cero: es una línea)
  const yTicks = [0, 1, 2, 3, 4].map((q) => first.capitalCents + Math.round(((last.capitalCents - first.capitalCents) * q) / 4));

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <figcaption>
          <span className="block text-lg font-bold text-ink">Crecimiento estimado de tu capital</span>
          <span className="text-sm text-ink-muted">Evolución mes a mes durante {meses} meses, proporcional al rendimiento total.</span>
        </figcaption>
        <Button variant="secondary" icon={asTable ? 'chart' : 'table'} onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Ver gráfica' : 'Ver como tabla'}
        </Button>
      </div>
      {asTable ? (
        <div className="max-h-80 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sunken">
              <tr className="text-left text-xs text-ink-muted">
                <th scope="col" className="px-3 py-2">Mes</th>
                <th scope="col" className="px-3 py-2 text-right">Capital estimado</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((p) => (
                <tr key={p.mes} className="border-t border-line">
                  <td className="px-3 py-2">{p.mes}</td>
                  <td className="tabular px-3 py-2 text-right">{formatMoney(p.capitalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="h-64 w-full sm:h-80"
          role="img"
          aria-label={`Gráfica de líneas: el capital pasa de ${formatMoney(first.capitalCents)} en el mes 0 a ${formatMoney(last.capitalCents)} en el mes ${last.mes}`}
        >
          <ResponsiveContainer>
            <LineChart data={serie} margin={{ top: 28, right: 28, bottom: 8, left: 8 }}>
              <CartesianGrid vertical={false} stroke={t.grid} />
              <XAxis
                dataKey="mes"
                type="number"
                domain={[0, meses]}
                ticks={serie.filter((p) => p.mes % (meses > 12 ? 6 : 3) === 0 || p.mes === meses).map((p) => p.mes)}
                tickFormatter={(m: number) => `Mes ${m}`}
                tick={{ fill: t.axis, fontSize: 12 }}
                axisLine={{ stroke: t.grid }}
                tickLine={false}
              />
              <YAxis tickFormatter={axisMoney} tick={{ fill: t.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={72} domain={[yTicks[0]!, yTicks[4]!]} ticks={yTicks} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.axis, strokeDasharray: '3 3' }} />
              <Line
                type="linear"
                dataKey="capitalCents"
                name="Capital estimado"
                stroke={t.capital}
                strokeWidth={2.5}
                isAnimationActive={false}
                dot={false}
                activeDot={{ r: 5, stroke: t.surface, strokeWidth: 2 }}
              />
              <ReferenceDot x={first.mes} y={first.capitalCents} r={5} fill={t.surface} stroke={t.capital} strokeWidth={2} label={{ value: 'Inicial', position: 'top', offset: 10, fill: t.axis, fontSize: 12 }} />
              <ReferenceDot x={last.mes} y={last.capitalCents} r={6} fill={t.capital} stroke={t.surface} strokeWidth={2} label={{ value: 'Final', position: 'top', fill: t.capital, fontSize: 12, fontWeight: 700 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
