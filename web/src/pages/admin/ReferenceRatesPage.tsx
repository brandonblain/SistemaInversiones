import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import type { ReferenceRate, ReferenceRateCode } from '../../api/types';
import { DataTable, Pagination, type Column } from '../../components/DataTable';
import { Alert, Async, Badge, Button, Card, EmptyState, errorMessage, PageHeader, SelectInput, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatRateBps, todayInContractZone } from '../../lib/format';
import { referenceRateLabel } from '../../lib/labels';
import { parsePercentToBps } from '../../lib/parse';

/**
 * Tasas CETES publicadas por Banxico. Las inversiones a CETES usan la tasa vigente al inicio de cada periodo
 * más su diferencial (p. ej. − 1 punto). Una tasa ya usada en un rendimiento confirmado no se puede borrar.
 */
export function ReferenceRatesPage() {
  const [code, setCode] = useState<ReferenceRateCode | ''>('');
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const list = useAsync(() => api.admin.referenceRates({ rate_code: code, page, pageSize: 20 }), [code, page, nonce]);
  const [rowError, setRowError] = useState<string | null>(null);

  const remove = async (r: ReferenceRate) => {
    setRowError(null);
    try {
      await api.admin.deleteReferenceRate(r.id);
      setNonce((n) => n + 1);
    } catch (err) {
      setRowError(errorMessage(err));
    }
  };

  const columns: Column<ReferenceRate>[] = [
    { key: 'date', header: 'Fecha', primary: true, render: (r) => formatDate(r.effective_date) },
    { key: 'code', header: 'Instrumento', render: (r) => referenceRateLabel[r.rate_code] },
    { key: 'rate', header: 'Tasa anual', align: 'right', render: (r) => <strong>{formatRateBps(r.annual_rate_bps)}</strong> },
    { key: 'source', header: 'Fuente', hideOnMobile: true, render: (r) => r.source ?? '—' },
    {
      key: 'use',
      header: 'Uso',
      render: (r) =>
        r.in_use ? (
          <Badge tone="info">Usada en rendimientos</Badge>
        ) : (
          <Button variant="ghost" className="min-h-[36px] px-2 py-1 text-xs text-bad" onClick={() => remove(r)}>Eliminar</Button>
        )
    }
  ];

  return (
    <>
      <PageHeader
        title="Tasas de referencia (CETES)"
        subtitle="Capture la tasa publicada por Banxico. Las inversiones a CETES usan la tasa vigente al inicio de cada periodo más su diferencial."
      />
      <Alert tone="warn" title="Pendiente de confirmar con el cliente">
        Plazo de CETES que aplica (28, 91, 182 o 364 días) y fecha de observación (hoy: la última tasa capturada con fecha igual o anterior al inicio del periodo).
      </Alert>
      <RateForm onSaved={() => { setPage(1); setNonce((n) => n + 1); }} />
      <Card className="mt-4" title="Historial de tasas">
        <div className="mb-4 max-w-xs">
          <SelectInput label="Instrumento" value={code} onChange={(e) => { setCode(e.target.value as ReferenceRateCode | ''); setPage(1); }}>
            <option value="">Todos</option>
            {(Object.keys(referenceRateLabel) as ReferenceRateCode[]).map((k) => <option key={k} value={k}>{referenceRateLabel[k]}</option>)}
          </SelectInput>
        </div>
        {rowError && <div className="mb-3"><Alert tone="bad">{rowError}</Alert></div>}
        <Async state={list}>
          {(res) => (
            <>
              <DataTable caption="Tasas de referencia" columns={columns} rows={res.data} rowKey={(r) => r.id} empty={<EmptyState icon="percent" title="Sin tasas capturadas" />} />
              <Pagination info={res.pagination} onPage={setPage} />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}

function RateForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ code: 'CETES_28' as ReferenceRateCode, date: todayInContractZone(), rate: '', source: 'Banxico' });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const bps = parsePercentToBps(form.rate);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setOk(null);
    if (bps === null || bps <= 0) return setError('Escriba la tasa anual, por ejemplo 7.45');
    if (!form.date || form.date > todayInContractZone()) return setError('Indique una fecha válida (no futura).');
    setError(null);
    setPending(true);
    try {
      await api.admin.createReferenceRate({ rate_code: form.code, effective_date: form.date, annual_rate_bps: bps, source: form.source.trim() || undefined });
      setOk(`${referenceRateLabel[form.code]} ${formatRateBps(bps)} al ${formatDate(form.date)} registrada.`);
      setForm((f) => ({ ...f, rate: '' }));
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mt-4" title="Capturar tasa">
      <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {error && <div className="sm:col-span-2 lg:col-span-4"><Alert tone="bad">{error}</Alert></div>}
        {ok && <div className="sm:col-span-2 lg:col-span-4"><Alert tone="ok">{ok}</Alert></div>}
        <SelectInput label="Instrumento" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value as ReferenceRateCode })}>
          {(Object.keys(referenceRateLabel) as ReferenceRateCode[]).map((k) => <option key={k} value={k}>{referenceRateLabel[k]}</option>)}
        </SelectInput>
        <TextInput label="Fecha de la tasa" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <TextInput
          label="Tasa anual (%)"
          inputMode="decimal"
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: e.target.value })}
          hint={bps ? `Se registrará: ${formatRateBps(bps)} (${bps} pb)` : 'Ejemplo: 7.45'}
        />
        <TextInput label="Fuente" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        <div className="sm:col-span-2 lg:col-span-4">
          <Button type="submit" icon="plus" loading={pending}>Registrar tasa</Button>
        </div>
      </form>
    </Card>
  );
}
