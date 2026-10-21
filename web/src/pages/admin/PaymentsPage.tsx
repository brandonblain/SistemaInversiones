import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { AdminPaymentRow, AdminYieldEntry } from '../../api/types';
import { InvestmentPicker } from '../../components/admin/InvestmentPicker';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Alert, Async, Button, Card, EmptyState, errorMessage, PageHeader, TextArea, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { centsToPlainPesos, formatDateTime, formatMoney, formatPeriod, todayInContractZone } from '../../lib/format';
import { mexicoCityLocalToIso, parsePesosToCents } from '../../lib/parse';

const paymentColumns: Column<AdminPaymentRow>[] = [
  { key: 'date', header: 'Fecha de pago', primary: true, render: (r) => formatDateTime(r.paid_at) },
  { key: 'inv', header: 'Contrato', render: (r) => r.investment_code },
  { key: 'who', header: 'Cliente', hideOnMobile: true, render: (r) => r.investor_name ?? '—' },
  { key: 'ref', header: 'Referencia', render: (r) => r.reference },
  { key: 'amount', header: 'Monto', align: 'right', render: (r) => formatMoney(r.amount_cents, r.currency) },
  { key: 'alloc', header: 'Asignado', align: 'right', render: (r) => formatMoney(r.allocated_cents, r.currency) }
];

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const investmentId = params.get('inversion') ?? '';
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const history = useAsync(() => api.admin.payments({ investment_id: investmentId || undefined, page, pageSize: 10 }), [investmentId, page, nonce]);

  return (
    <>
      <PageHeader title="Pagos externos" subtitle="Registre transferencias ya realizadas fuera del portal y asígnelas a los rendimientos que liquidan." />
      <Alert tone="info">El portal no mueve dinero. Solo registre un pago cuando tenga el comprobante bancario de que ya se realizó.</Alert>
      <Card className="mt-4">
        <div className="max-w-xl">
          <InvestmentPicker value={investmentId} onChange={(id) => { setParams(id ? { inversion: id } : {}, { replace: true }); setPage(1); }} />
        </div>
      </Card>
      {saved && <div className="mt-4"><Alert tone="ok">{saved}</Alert></div>}
      {investmentId && (
        <PaymentForm
          key={`${investmentId}-${nonce}`}
          investmentId={investmentId}
          onEdit={() => setSaved(null)}
          onSaved={(msg) => {
            // El formulario se vuelve a montar limpio; el aviso de éxito vive en la página.
            setSaved(msg);
            setNonce((n) => n + 1);
          }}
        />
      )}
      <Card className="mt-4" title={investmentId ? 'Pagos de este contrato' : 'Pagos registrados'}>
        <Async state={history}>
          {(res) => (
            <>
              <DataTable caption="Pagos externos" columns={paymentColumns} rows={res.data} rowKey={(r) => r.id} empty={<EmptyState icon="cash" title="Sin pagos registrados" />} />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

function PaymentForm({ investmentId, onSaved, onEdit }: { investmentId: string; onSaved: (msg: string) => void; onEdit: () => void }) {
  const pending = useAsync(() => api.admin.yields(investmentId, { pendingOnly: true }), [investmentId]);
  const inv = useAsync(() => api.admin.investment(investmentId), [investmentId]);
  const currency = inv.data?.currency ?? 'MXN';
  const formatMXN = (c: number) => formatMoney(c, currency);
  const [form, setForm] = useState({ amount: '', date: todayInContractZone(), time: '12:00', reference: '', notes: '' });
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountCents = parsePesosToCents(form.amount);
  const allocCents = Object.entries(alloc)
    .filter(([, v]) => v.trim() !== '')
    .map(([id, v]) => ({ yield_entry_id: id, amount_cents: parsePesosToCents(v) }));
  // Suma de lo capturado: validación de captura, no cálculo financiero.
  const allocTotal = allocCents.reduce((s, a) => s + (a.amount_cents ?? 0), 0);

  const validate = (entries: AdminYieldEntry[]): string | null => {
    if (amountCents === null || amountCents <= 0) return 'Escriba el monto del pago.';
    if (!form.reference.trim()) return 'La referencia bancaria (SPEI, folio) es obligatoria.';
    const paidAt = mexicoCityLocalToIso(form.date, form.time);
    if (!paidAt) return 'Fecha u hora no válidas.';
    if (form.date > todayInContractZone()) return 'La fecha de pago no puede ser futura.';
    for (const a of allocCents) {
      const entry = entries.find((e) => e.id === a.yield_entry_id);
      if (a.amount_cents === null || a.amount_cents <= 0) return 'Revise los importes asignados.';
      if (entry && a.amount_cents > entry.pending_cents) return `La asignación al periodo ${formatPeriod(entry.period_start, entry.period_end)} excede su saldo pendiente.`;
    }
    if (allocTotal > amountCents) return 'El total asignado no puede ser mayor que el monto del pago.';
    if (!ack) return 'Confirme que el pago externo ya se realizó.';
    return null;
  };

  const submit = async (e: FormEvent, entries: AdminYieldEntry[]) => {
    e.preventDefault();
    if (saving) return;
    onEdit();
    const problem = validate(entries);
    if (problem) return setError(problem);
    setError(null);
    setSaving(true);
    try {
      await api.admin.recordPayment({
        investment_id: investmentId,
        amount_cents: amountCents!,
        paid_at: mexicoCityLocalToIso(form.date, form.time)!,
        reference: form.reference.trim(),
        notes: form.notes.trim() || undefined,
        allocations: allocCents.map((a) => ({ yield_entry_id: a.yield_entry_id, amount_cents: a.amount_cents! }))
      });
      onSaved(`Pago ${form.reference.trim()} registrado. Se notificará al cliente por correo (sin montos).`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-4" title="Registrar pago">
      <Async state={pending}>
        {(entries) => (
          <form onSubmit={(e) => submit(e, entries)} noValidate className="space-y-5">
            {error && <Alert tone="bad">{error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <TextInput label={`Monto pagado (${currency})`} inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} hint={amountCents ? formatMXN(amountCents) : undefined} />
              <TextInput label="Fecha del pago" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <TextInput label="Hora (Ciudad de México)" type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              <TextInput label="Referencia bancaria" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </div>
            <TextArea label="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">Asignar a rendimientos pendientes</legend>
              {entries.length === 0 ? (
                <p className="text-sm text-ink-muted">Este contrato no tiene rendimientos confirmados pendientes de pago.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {entries.map((y) => (
                    <li key={y.id} className="grid items-end gap-2 p-3 sm:grid-cols-[1fr_200px_auto]">
                      <div>
                        <p className="text-sm font-medium text-ink">Periodo {formatPeriod(y.period_start, y.period_end)}</p>
                        <p className="text-xs text-ink-muted">Confirmado {formatMXN(y.amount_cents)} · pendiente {formatMXN(y.pending_cents)}</p>
                      </div>
                      <TextInput
                        label="Importe a asignar"
                        inputMode="decimal"
                        value={alloc[y.id] ?? ''}
                        onChange={(e) => setAlloc({ ...alloc, [y.id]: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs"
                        onClick={() => setAlloc({ ...alloc, [y.id]: centsToPlainPesos(y.pending_cents) })}
                      >
                        Saldo completo
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-sm text-ink-2" aria-live="polite">
                Asignado: <strong className="tabular">{formatMXN(allocTotal)}</strong>
                {amountCents ? <> de <strong className="tabular">{formatMXN(amountCents)}</strong></> : null}
              </p>
            </fieldset>

            <label className="flex items-start gap-2 text-sm text-ink-2">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Confirmo que esta transferencia externa ya se realizó y cuento con el comprobante.
            </label>
            <Button type="submit" loading={saving}>Registrar pago confirmado</Button>
          </form>
        )}
      </Async>
    </Card>
  );
}
