import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Async, Card, KpiTile, LoadingBlock, PageHeader } from '../../components/ui';
import { MarketIndicators } from '../../components/MarketIndicators';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney } from '../../lib/format';

export function AdminDashboardPage() {
  const summary = useAsync(() => api.admin.summary(), []);

  return (
    <>
      <PageHeader title="Resumen de administración" subtitle={summary.data ? `Al ${formatDate(summary.data.as_of_date, 'long')}` : undefined} />
      <Async state={summary} loading={<LoadingBlock rows={6} />}>
        {(s) => (
          <div className="space-y-5">
            <dl className="metric-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <KpiTile label="Clientes" value={s.investors_count} />
              <KpiTile label="Contratos vigentes" value={s.active_investments_count} />
              <KpiTile label="Vencen en los próximos 30 días" value={s.maturing_soon_count} />
              <KpiTile tone={s.notifications_failed_count > 0 ? 'attention' : 'default'} label="Correos con error" value={s.notifications_failed_count} />
            </dl>

            {/* Cifras por moneda: pesos y dólares nunca se suman */}
            <dl className="metric-grid grid-cols-1 sm:grid-cols-2">
              {s.by_currency.map((t) => (
                <div key={t.currency} className="contents">
                  <KpiTile tone="brand" label={`Capital vigente (${t.currency})`} value={formatMoney(t.total_capital_cents, t.currency)} help={`${t.active_investments_count} contratos vigentes en ${t.currency}`} />
                  <KpiTile tone="attention" label={`Rendimiento pendiente de pago (${t.currency})`} value={formatMoney(t.yield_pending_cents, t.currency)} help="Confirmado y aún no pagado ni reinvertido." />
                </div>
              ))}
            </dl>

            <MarketIndicators variant="admin" />

          </div>
        )}
      </Async>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Tareas frecuentes">
          <ul className="space-y-2 text-sm">
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/estadisticas">Ver estadísticas generales y por cliente</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/rendimientos">Calcular y confirmar rendimientos</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/pagos">Registrar un pago externo</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/inversiones/nueva">Dar de alta un contrato</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/documentos">Subir un documento</Link></li>
          </ul>
        </Card>
        <Card title="Recordatorio">
          <p className="text-sm text-ink-2">
            Las convenciones de cálculo (base de días, fechas de corte, significado de “a liquidación”, y reglas de reinversión) siguen <strong>pendientes de aprobación por escrito</strong>. No confirme rendimientos
            definitivos de clientes reales hasta tenerlas.
          </p>
        </Card>
      </div>
    </>
  );
}
