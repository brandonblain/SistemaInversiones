import { useState } from 'react';
import { api } from '../../api';
import type { AdminYieldEntry, CapitalizationPolicy } from '../../api/types';
import { formatDate, formatMoney, formatPeriod, todayInContractZone } from '../../lib/format';
import { yieldSourceLabel } from '../../lib/labels';
import { YieldStatusBadge } from '../badges';
import { DataTable, type Column } from '../DataTable';
import { Modal } from '../Modal';
import { Alert, Badge, Button, EmptyState, errorMessage, TextArea, TextInput } from '../ui';

type Action = { kind: 'reverse' | 'reinvest'; entry: AdminYieldEntry } | null;

/** Partidas de rendimiento de una inversión con acciones de reversión y reinversión (según contrato). */
export function YieldEntriesTable({ entries, policy, investmentId, onChanged, currency = 'MXN' }: { entries: AdminYieldEntry[]; policy: CapitalizationPolicy; investmentId: string; onChanged: () => void; currency?: string }) {
  const formatMXN = (c: number) => formatMoney(c, currency);
  const [action, setAction] = useState<Action>(null);
  const [reason, setReason] = useState('');
  const [date, setDate] = useState(todayInContractZone());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    setAction(null);
    setReason('');
    setError(null);
  };

  const submit = async () => {
    if (!action || pending) return;
    if (action.kind === 'reverse' && reason.trim().length < 5) return setError('Explique el motivo (mínimo 5 caracteres).');
    setPending(true);
    setError(null);
    try {
      if (action.kind === 'reverse') await api.admin.reverseYield(action.entry.id, reason.trim());
      else await api.admin.reinvest(investmentId, { yield_entry_id: action.entry.id, effective_date: date, notes: reason.trim() || undefined });
      close();
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const untouched = (e: AdminYieldEntry) => e.status === 'CONFIRMED' && e.paid_cents === 0 && e.reinvested_cents === 0;

  const columns: Column<AdminYieldEntry>[] = [
    { key: 'period', header: 'Periodo', primary: true, render: (r) => formatPeriod(r.period_start, r.period_end) },
    { key: 'source', header: 'Origen', render: (r) => <Badge>{yieldSourceLabel[r.source]}</Badge> },
    { key: 'status', header: 'Estado', render: (r) => <YieldStatusBadge status={r.status} /> },
    { key: 'amount', header: 'Importe', align: 'right', render: (r) => formatMXN(r.amount_cents) },
    { key: 'paid', header: 'Pagado', align: 'right', render: (r) => formatMXN(r.paid_cents) },
    { key: 'reinv', header: 'Reinvertido', align: 'right', render: (r) => formatMXN(r.reinvested_cents) },
    { key: 'pending', header: 'Pendiente', align: 'right', render: (r) => formatMXN(r.pending_cents) },
    {
      key: 'actions',
      header: 'Acciones',
      render: (r) =>
        r.source === 'REVERSAL' ? (
          <span className="text-xs text-ink-muted">{r.note}</span>
        ) : untouched(r) ? (
          <div className="flex flex-wrap gap-1">
            {policy === 'COMPOUND_TO_CAPITAL' && (
              <Button variant="secondary" className="min-h-[36px] px-2 py-1 text-xs" onClick={() => setAction({ kind: 'reinvest', entry: r })}>Reinvertir</Button>
            )}
            <Button variant="ghost" className="min-h-[36px] px-2 py-1 text-xs text-bad" onClick={() => setAction({ kind: 'reverse', entry: r })}>Reversar</Button>
          </div>
        ) : (
          <span className="text-xs text-ink-muted">{r.note ?? '—'}</span>
        )
    }
  ];

  return (
    <>
      <DataTable caption="Partidas de rendimiento" columns={columns} rows={entries} rowKey={(r) => r.id} empty={<EmptyState title="Sin rendimientos registrados" />} />

      <Modal
        open={!!action}
        onClose={close}
        title={action?.kind === 'reverse' ? 'Reversar rendimiento' : 'Reinvertir rendimiento a capital'}
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button variant={action?.kind === 'reverse' ? 'danger' : 'primary'} loading={pending} onClick={submit}>
              {action?.kind === 'reverse' ? 'Reversar' : 'Confirmar reinversión'}
            </Button>
          </>
        }
      >
        {action && (
          <div className="space-y-4">
            {error && <Alert tone="bad">{error}</Alert>}
            <p className="text-sm text-ink-2">
              Periodo {formatPeriod(action.entry.period_start, action.entry.period_end)} · {formatMXN(action.entry.amount_cents)}
            </p>
            {action.kind === 'reverse' ? (
              <>
                <Alert tone="warn">Se creará un contra-asiento. El registro original se conserva en la bitácora.</Alert>
                <TextArea label="Motivo de la reversión" value={reason} onChange={(e) => setReason(e.target.value)} />
              </>
            ) : (
              <>
                <Alert tone="info">El importe se sumará al capital del contrato a partir de la fecha efectiva. Solo aplica si el contrato lo permite.</Alert>
                <TextInput label="Fecha efectiva" type="date" value={date} onChange={(e) => setDate(e.target.value)} hint={`Hoy: ${formatDate(todayInContractZone())}`} />
                <TextArea label="Nota (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
