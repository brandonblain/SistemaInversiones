import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Async, Card, KpiTile, LoadingBlock, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMXN } from '../../lib/format';

export function AdminDashboardPage() {
  const summary = useAsync(() => api.admin.summary(), []);

  return (
    <>
      <PageHeader title="Resumen de administración" subtitle={summary.data ? `Al ${formatDate(summary.data.as_of_date, 'long')}` : undefined} />
      <Async state={summary} loading={<LoadingBlock rows={6} />}>
        {(s) => (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiTile label="Inversionistas" value={s.investors_count} />
            <KpiTile label="Inversiones vigentes" value={s.active_investments_count} />
            <KpiTile tone="brand" label="Capital vigente total" value={formatMXN(s.total_capital_cents)} />
            <KpiTile tone="attention" label="Rendimiento pendiente de pago" value={formatMXN(s.yield_pending_cents)} help="Confirmado y aún no pagado ni reinvertido." />
            <KpiTile label="Vencen en los próximos 30 días" value={s.maturing_soon_count} />
            <KpiTile tone={s.notifications_failed_count > 0 ? 'attention' : 'default'} label="Correos con error" value={s.notifications_failed_count} />
          </dl>
        )}
      </Async>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Tareas frecuentes">
          <ul className="space-y-2 text-sm">
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/rendimientos">Calcular y confirmar rendimientos</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/pagos">Registrar un pago externo</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/inversiones/nueva">Dar de alta una inversión</Link></li>
            <li><Link className="font-semibold text-brand hover:underline" to="/admin/documentos">Subir un documento</Link></li>
          </ul>
        </Card>
        <Card title="Recordatorio">
          <p className="text-sm text-ink-2">
            Las convenciones de cálculo (base de días, fechas de corte, significado de “a liquidación” y reglas de reinversión) siguen
            <strong> pendientes de aprobación por escrito</strong>. No confirme rendimientos definitivos de clientes reales hasta tenerlas.
          </p>
        </Card>
      </div>
    </>
  );
}
