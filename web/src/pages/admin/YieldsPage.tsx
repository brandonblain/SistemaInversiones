import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { YieldPreview } from '../../api/types';
import { InvestmentPicker } from '../../components/admin/InvestmentPicker';
import { YieldEntriesTable } from '../../components/admin/YieldEntriesTable';
import { Alert, Async, Badge, Button, Card, DefinitionList, EmptyState, errorMessage, PageHeader, TextArea, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney, formatPeriod, formatRateBps, formatSpreadBps } from '../../lib/format';
import { dayCountLabel, referenceRateLabel } from '../../lib/labels';
import { parsePesosToCents } from '../../lib/parse';

export function YieldsPage() {
  const [params, setParams] = useSearchParams();
  const investmentId = params.get('inversion') ?? '';
  const choose = (id: string) => setParams(id ? { inversion: id } : {}, { replace: true });

  return (
    <>
      <PageHeader title="Rendimientos" subtitle="El cálculo lo realiza el servidor. Usted revisa la vista previa y confirma." />
      <Alert tone="warn" title="Convenciones pendientes de aprobación">
        Base de días, fechas de corte y reglas de reinversión aún no están aprobadas por escrito. Use esta pantalla solo con datos de prueba hasta entonces.
      </Alert>
      <Card className="mt-4">
        <div className="max-w-xl">
          <InvestmentPicker value={investmentId} onChange={choose} />
        </div>
      </Card>
      {investmentId ? <YieldWorkspace key={investmentId} investmentId={investmentId} /> : (
        <Card className="mt-4"><EmptyState icon="percent" title="Seleccione una inversión">Verá sus partidas y podrá calcular un nuevo periodo.</EmptyState></Card>
      )}
    </>
  );
}

function YieldWorkspace({ investmentId }: { investmentId: string }) {
  const inv = useAsync(() => api.admin.investment(investmentId), [investmentId]);
  const entries = useAsync(() => api.admin.yields(investmentId), [investmentId]);
  const refresh = () => {
    entries.reload();
    inv.reload();
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <PreviewCard investmentId={investmentId} currency={inv.data?.currency ?? 'MXN'} onConfirmed={refresh} />
      <ManualCard investmentId={investmentId} currency={inv.data?.currency ?? 'MXN'} onSaved={refresh} />
      <Card title="Partidas de rendimiento" className="lg:col-span-2">
        <Async state={inv}>
          {(d) => (
            <Async state={entries}>
              {(list) => <YieldEntriesTable entries={list} currency={d.currency} policy={d.terms.capitalization_policy} investmentId={investmentId} onChanged={refresh} />}
            </Async>
          )}
        </Async>
      </Card>
    </div>
  );
}

function PreviewCard({ investmentId, currency, onConfirmed }: { investmentId: string; currency: string; onConfirmed: () => void }) {
  const formatMXN = (c: number) => formatMoney(c, currency);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [preview, setPreview] = useState<YieldPreview | null>(null);
  const [result, setResult] = useState<{ existing: boolean; amount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'confirm' | null>(null);

  const doPreview = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setResult(null);
    setPreview(null);
    if (!start || !end) return setError('Indique inicio y fin del periodo.');
    if (end <= start) return setError('La fecha final debe ser posterior a la inicial. El periodo incluye el inicio y excluye el fin.');
    setError(null);
    setBusy('preview');
    try {
      setPreview(await api.admin.previewYield({ investment_id: investmentId, period_start: start, period_end: end }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!preview || busy) return;
    setBusy('confirm');
    setError(null);
    try {
      const r = await api.admin.confirmYield({
        investment_id: investmentId,
        period_start: preview.period_start,
        period_end: preview.period_end,
        amount_cents: preview.calculated_yield_cents
      });
      setResult({ existing: r.is_existing, amount: r.amount_cents });
      setPreview(null);
      onConfirmed();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Calcular periodo">
      <form onSubmit={doPreview} noValidate className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        {result && (
          <Alert tone={result.existing ? 'warn' : 'ok'}>
            {result.existing
              ? `Ya existía un rendimiento confirmado para ese periodo (${formatMXN(result.amount)}). No se duplicó.`
              : `Rendimiento confirmado por ${formatMXN(result.amount)}.`}
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Inicio del periodo" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          <TextInput label="Fin del periodo (no incluido)" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button type="submit" variant="secondary" loading={busy === 'preview'}>Ver vista previa</Button>
      </form>

      {preview && (
        <div className="mt-5 rounded-lg border border-dashed border-warn/60 bg-warn-soft/40 p-4" data-testid="yield-preview">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Badge tone="warn">Proyección · aún no confirmada</Badge>
            <span className="text-xs text-ink-muted">{formatPeriod(preview.period_start, preview.period_end)}</span>
          </div>
          <DefinitionList
            items={[
              { label: 'Días del periodo', value: preview.days_in_period },
              { label: 'Capital de referencia', value: formatMXN(preview.capital_cents) },
              { label: 'Tasa anual aplicada', value: formatRateBps(preview.annual_rate_bps) },
              ...(preview.rate_type === 'REFERENCE' && preview.reference_rate_code
                ? [{
                    label: 'Tasa de referencia',
                    value: `${referenceRateLabel[preview.reference_rate_code]} ${formatRateBps(preview.reference_rate_bps)} (al ${formatDate(preview.reference_rate_date)}) ${formatSpreadBps(preview.spread_bps)}`
                  }]
                : []),
              { label: 'Convención', value: dayCountLabel[preview.day_count_convention] ?? preview.day_count_convention },
              { label: 'Fórmula aplicada por el servidor', value: <code className="break-all text-xs">{preview.calculation_formula}</code> },
              { label: 'Rendimiento calculado', value: <strong className="text-lg">{formatMXN(preview.calculated_yield_cents)}</strong> }
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={confirm} loading={busy === 'confirm'}>Confirmar rendimiento</Button>
            <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy === 'confirm'}>Descartar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function ManualCard({ investmentId, currency, onSaved }: { investmentId: string; currency: string; onSaved: () => void }) {
  const formatMXN = (c: number) => formatMoney(c, currency);
  const [form, setForm] = useState({ start: '', end: '', amount: '', reason: '' });
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cents = parsePesosToCents(form.amount, { allowNegative: true });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setOk(null);
    if (!form.start || !form.end || form.end <= form.start) return setError('Indique un periodo válido.');
    if (cents === null || cents === 0) return setError('Escriba un importe distinto de cero. Use signo negativo para disminuir.');
    if (form.reason.trim().length < 5) return setError('El motivo es obligatorio (mínimo 5 caracteres).');
    if (!ack) return setError('Confirme que el ajuste está respaldado por el contrato o un acuerdo por escrito.');
    setError(null);
    setPending(true);
    try {
      await api.admin.manualYield({ investment_id: investmentId, period_start: form.start, period_end: form.end, amount_cents: cents, reason: form.reason.trim() });
      setOk(`Ajuste registrado por ${formatMXN(cents)}.`);
      setForm({ start: '', end: '', amount: '', reason: '' });
      setAck(false);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card title="Rendimiento manual o ajuste">
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        {ok && <Alert tone="ok">{ok}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Inicio del periodo" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <TextInput label="Fin del periodo" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <TextInput
          label={`Importe (${currency})`}
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          hint={cents !== null ? `Se registrará: ${formatMXN(cents)}` : 'Ejemplo: 1,250.00 o -300.00'}
        />
        <TextArea label="Motivo (queda en la bitácora)" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <label className="flex items-start gap-2 text-sm text-ink-2">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          El ajuste está respaldado por el contrato o por un acuerdo por escrito.
        </label>
        <Button type="submit" loading={pending}>Registrar ajuste</Button>
      </form>
    </Card>
  );
}
