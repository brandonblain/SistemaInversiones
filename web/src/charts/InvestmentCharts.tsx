// Gráficas de evolución. Se cargan bajo demanda (React.lazy) para no pesar en la carga inicial en Android.
// Reglas: una sola escala por gráfica (capital y rendimientos van en gráficas separadas), colores en orden fijo,
// leyenda + vista de tabla, y SOLO cifras entregadas por la API (sin proyecciones ni rentabilidad de mercado).

import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { InvestmentSeries } from '../api/types';
import { Button, EmptyState } from '../components/ui';
import { formatDate, formatMoney, formatMonthTick, formatPeriod } from '../lib/format';
import { useChartTheme } from './useChartTheme';

const compact = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
/** Solo para etiquetas de eje: aproximación visual, nunca se muestra como cifra oficial. */
const axisMoney = (currency: string) => (cents: number) => `${currency === 'USD' ? 'US$' : '$'}${compact.format(cents / 100)}`;

function ChartTooltip({ active, payload, label, labelFormat, currency }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{labelFormat(label, payload[0]?.payload)}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="tabular font-semibold text-ink">{formatMoney(p.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

export default function InvestmentCharts({ series, currency = 'MXN' }: { series: InvestmentSeries; currency?: string }) {
  const money = (c: number) => formatMoney(c, currency);
  const axisMXN = axisMoney(currency);
  const t = useChartTheme();
  const [asTable, setAsTable] = useState(false);
  const periods = series.yield_periods;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <Button variant="secondary" icon={asTable ? 'chart' : 'table'} onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Ver gráficas' : 'Ver como tabla'}
        </Button>
      </div>

      {/* 1. Capital */}
      <figure>
        <figcaption className="mb-1">
          <span className="block font-semibold text-ink">Capital vigente</span>
          <span className="text-xs text-ink-muted">Cambia solo por aportaciones o reinversiones confirmadas. Al {formatDate(series.as_of_date)}.</span>
        </figcaption>
        {asTable ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-2">Fecha</th><th className="py-2 text-right">Capital vigente</th></tr></thead>
            <tbody>
              {series.capital_points.map((p) => (
                <tr key={p.date} className="border-b border-line"><td className="py-2">{formatDate(p.date)}</td><td className="tabular py-2 text-right">{money(p.capital_cents)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-56 w-full" role="img" aria-label="Gráfica escalonada del capital vigente a lo largo del tiempo">
            <ResponsiveContainer>
              <AreaChart data={series.capital_points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="date" tickFormatter={formatMonthTick} tick={{ fill: t.axis, fontSize: 12 }} axisLine={{ stroke: t.grid }} tickLine={false} minTickGap={24} />
                <YAxis tickFormatter={axisMXN} tick={{ fill: t.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={64} domain={[0, 'auto']} />
                <Tooltip content={<ChartTooltip currency={currency} labelFormat={(l: string) => formatDate(l)} />} cursor={{ stroke: t.axis, strokeDasharray: '3 3' }} />
                <Area type="stepAfter" dataKey="capital_cents" name="Capital vigente" stroke={t.capital} strokeWidth={2} fill={t.capital} fillOpacity={0.12} isAnimationActive={false} dot={false} activeDot={{ r: 4, stroke: t.surface, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </figure>

      {/* 2. Rendimientos por periodo */}
      <figure>
        <figcaption className="mb-1">
          <span className="block font-semibold text-ink">Rendimiento confirmado por periodo</span>
          <span className="text-xs text-ink-muted">Cada barra es un periodo confirmado, dividido según su destino.</span>
        </figcaption>
        {periods.length === 0 ? (
          <EmptyState title="Aún no hay rendimientos confirmados">Aparecerán aquí cuando la administración confirme el primer periodo.</EmptyState>
        ) : asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="py-2 pr-2">Periodo</th><th className="py-2 text-right">Confirmado</th><th className="py-2 text-right">Pagado</th><th className="py-2 text-right">Reinvertido</th><th className="py-2 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period_end} className="border-b border-line">
                    <td className="py-2 pr-2">{formatPeriod(p.period_start, p.period_end)}</td>
                    <td className="tabular py-2 text-right">{money(p.confirmed_cents)}</td>
                    <td className="tabular py-2 text-right">{money(p.paid_cents)}</td>
                    <td className="tabular py-2 text-right">{money(p.reinvested_cents)}</td>
                    <td className="tabular py-2 text-right">{money(p.pending_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64 w-full" role="img" aria-label="Gráfica de barras apiladas: rendimiento confirmado por periodo, pagado, reinvertido y pendiente">
            <ResponsiveContainer>
              <BarChart data={periods} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="period_end" tickFormatter={formatMonthTick} tick={{ fill: t.axis, fontSize: 12 }} axisLine={{ stroke: t.grid }} tickLine={false} minTickGap={12} />
                <YAxis tickFormatter={axisMXN} tick={{ fill: t.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip
                  cursor={{ fill: t.grid, fillOpacity: 0.4 }}
                  content={<ChartTooltip currency={currency} labelFormat={(_: string, row: InvestmentSeries['yield_periods'][number]) => `Periodo ${formatPeriod(row.period_start, row.period_end)}`} />}
                />
                <Legend verticalAlign="top" align="left" height={32} iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="paid_cents" name="Pagado" stackId="y" fill={t.paid} stroke={t.surface} strokeWidth={1} isAnimationActive={false} />
                <Bar dataKey="reinvested_cents" name="Reinvertido" stackId="y" fill={t.reinvested} stroke={t.surface} strokeWidth={1} isAnimationActive={false} />
                <Bar dataKey="pending_cents" name="Pendiente de pago" stackId="y" fill={t.pending} stroke={t.surface} strokeWidth={1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </figure>

      <p className="text-xs text-ink-muted">
        Las gráficas muestran únicamente movimientos registrados y confirmados. No incluyen proyecciones ni comparaciones con rendimientos de mercado.
      </p>
    </div>
  );
}
