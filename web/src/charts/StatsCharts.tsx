// Gráficas de estadísticas (carga diferida). Reglas: una moneda por gráfica, una sola escala,
// colores en orden fijo, leyenda para 2 series y vista de tabla disponible.
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdminStatistics } from '../api/types';
import { Button, EmptyState } from '../components/ui';
import { formatMoney } from '../lib/format';
import { investmentTypeLabel } from '../lib/labels';
import { useChartTheme } from './useChartTheme';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const compact = new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 });
const axis = (currency: string) => (cents: number) => `${currency === 'USD' ? 'US$' : '$'}${compact.format(cents / 100)}`;

function Tip({ active, payload, label, currency, labelFormat }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold text-ink">{labelFormat ? labelFormat(label) : label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="tabular font-semibold text-ink">{formatMoney(p.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

export default function StatsCharts({ stats, currency }: { stats: AdminStatistics; currency: string }) {
  const t = useChartTheme();
  const [asTable, setAsTable] = useState(false);
  const monthly = stats.monthly.filter((m) => m.currency === currency);
  const byType = stats.by_type.filter((x) => x.currency === currency).map((x) => ({ ...x, label: investmentTypeLabel[x.investment_type] }));
  const money = (c: number) => formatMoney(c, currency);
  const hasMonthly = monthly.some((m) => m.yield_confirmed_cents !== 0 || m.paid_cents !== 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="secondary" icon={asTable ? 'chart' : 'table'} onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? 'Ver gráficas' : 'Ver como tabla'}
        </Button>
      </div>

      <figure>
        <figcaption className="mb-1">
          <span className="block font-semibold text-ink">Rendimiento confirmado y pagos por mes ({currency})</span>
          <span className="text-xs text-ink-muted">Últimos 12 meses. Confirmado por mes de cierre del periodo; pagos por fecha de pago.</span>
        </figcaption>
        {!hasMonthly ? (
          <EmptyState icon="chart" title="Sin movimientos en los últimos 12 meses">Aquí aparecerán los rendimientos confirmados y los pagos registrados.</EmptyState>
        ) : asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-2">Mes</th><th className="py-2 text-right">Confirmado</th><th className="py-2 text-right">Pagado</th></tr></thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-line"><td className="py-2">{monthLabel(m.month)}</td><td className="tabular py-2 text-right">{money(m.yield_confirmed_cents)}</td><td className="tabular py-2 text-right">{money(m.paid_cents)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-64 w-full" role="img" aria-label={`Barras por mes: rendimiento confirmado y pagos en ${currency}`}>
            <ResponsiveContainer>
              <BarChart data={monthly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke={t.grid} />
                <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: t.axis, fontSize: 12 }} axisLine={{ stroke: t.grid }} tickLine={false} />
                <YAxis tickFormatter={axis(currency)} tick={{ fill: t.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
                <Tooltip cursor={{ fill: t.grid, fillOpacity: 0.4 }} content={<Tip currency={currency} labelFormat={monthLabel} />} />
                <Legend verticalAlign="top" align="left" height={32} iconType="square" wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="yield_confirmed_cents" name="Rendimiento confirmado" fill={t.capital} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="paid_cents" name="Pagado" fill={t.pending} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </figure>

      {byType.length > 0 && (
        <figure>
          <figcaption className="mb-1">
            <span className="block font-semibold text-ink">Capital vigente por ramo ({currency})</span>
          </figcaption>
          {asTable ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-ink-muted"><th className="py-2">Ramo</th><th className="py-2 text-right">Inversiones</th><th className="py-2 text-right">Capital vigente</th><th className="py-2 text-right">Rend. confirmado</th></tr></thead>
              <tbody>
                {byType.map((x) => (
                  <tr key={x.investment_type} className="border-b border-line"><td className="py-2">{x.label}</td><td className="tabular py-2 text-right">{x.investments_count}</td><td className="tabular py-2 text-right">{money(x.capital_cents)}</td><td className="tabular py-2 text-right">{money(x.yield_confirmed_cents)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="w-full" style={{ height: Math.max(120, byType.length * 52 + 30) }} role="img" aria-label={`Barras horizontales: capital vigente por ramo en ${currency}`}>
              <ResponsiveContainer>
                <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid horizontal={false} stroke={t.grid} />
                  <XAxis type="number" tickFormatter={axis(currency)} tick={{ fill: t.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={90} tick={{ fill: t.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: t.grid, fillOpacity: 0.4 }} content={<Tip currency={currency} />} />
                  <Bar dataKey="capital_cents" name="Capital vigente" fill={t.capital} radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </figure>
      )}
    </div>
  );
}
