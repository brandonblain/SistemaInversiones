import { Link } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { BalanceTiles } from '../../components/BalanceTiles';
import { MarketIndicators } from '../../components/MarketIndicators';
import { InvestmentStatusBadge } from '../../components/badges';
import { Async, Card, EmptyState, LoadingBlock, PageHeader } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney } from '../../lib/format';
import { currencyLabel, investmentTypeLabel, payoutFrequencyLabel, rateSummary } from '../../lib/labels';
import { BRAND } from '../../layouts/brand';

export function DashboardPage() {
  const { session } = useAuth();
  const summary = useAsync(() => api.investor.summary(), []);
  const active = useAsync(() => api.investor.investments({ status: 'ACTIVE', pageSize: 6 }), []);
  const firstName = session?.investor_profile?.full_name?.split(' ')[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : 'Resumen'}
        subtitle={summary.data ? `Cifras al ${formatDate(summary.data.as_of_date, 'long')}` : 'Resumen de sus inversiones'}
      />

      <Async state={summary} loading={<LoadingBlock rows={6} />}>
        {(s) =>
          s.by_currency.length === 0 ? (
            <EmptyState title="Aún no tiene inversiones registradas" />
          ) : (
            <>
              {/* Un bloque por moneda: pesos y dólares nunca se suman */}
              <div className="space-y-8">
                {s.by_currency.map((t, i) => (
                  <section key={t.currency} aria-labelledby={`moneda-${t.currency}`}>
                    {s.by_currency.length > 1 && (
                      <h2 id={`moneda-${t.currency}`} className="mb-3 border-b border-line pb-2 text-lg font-bold text-brand">
                        {currencyLabel[t.currency] ?? t.currency}
                      </h2>
                    )}
                    <BalanceTiles
                      currency={t.currency}
                      idPrefix={i === 0 ? '' : `${t.currency.toLowerCase()}-`}
                      v={{
                        capital: t.total_capital_cents,
                        generated: t.total_yield_generated_cents,
                        confirmed: t.total_yield_confirmed_cents,
                        reinvested: t.total_yield_reinvested_cents,
                        paid: t.total_yield_paid_cents,
                        pending: t.total_yield_pending_cents
                      }}
                    />
                  </section>
                ))}
              </div>
              <p className="mt-3 text-xs text-ink-muted">
                Las cifras son informativas y provienen de los registros confirmados por la administración. {BRAND.supportText}
              </p>
            </>
          )
        }
      </Async>

      <MarketIndicators variant="investor" className="mt-6" />

      <Card
        className="mt-6"
        title="Inversiones vigentes"
        actions={<Link to="/app/inversiones" className="text-sm font-semibold text-brand hover:underline">Ver todas</Link>}
      >
        <Async state={active}>
          {(page) =>
            page.data.length === 0 ? (
              <EmptyState title="No tiene inversiones vigentes">Sus inversiones vencidas siguen disponibles en la sección Inversiones.</EmptyState>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {page.data.map((inv) => (
                  <li key={inv.id}>
                    <Link to={`/app/inversiones/${inv.id}`} className="block rounded-lg border border-line p-4 transition hover:border-brand hover:bg-brand-soft/40">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-ink">{inv.code} <span className="font-normal text-ink-muted">· {investmentTypeLabel[inv.investment_type]}</span></span>
                        <InvestmentStatusBadge status={inv.status} />
                      </div>
                      <p className="mt-2 text-lg font-bold text-ink">{formatMoney(inv.current_capital_cents, inv.currency)}</p>
                      <p className="text-xs text-ink-muted">Capital vigente · {inv.currency}</p>
                      <p className="mt-2 text-sm text-ink-2">
                        {rateSummary(inv.terms)} · {payoutFrequencyLabel[inv.terms.payout_frequency]}
                      </p>
                      <p className="text-xs text-ink-muted">Vence el {formatDate(inv.maturity_date)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </Card>
    </>
  );
}
