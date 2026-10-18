import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import type { CapitalizationPolicy, DayCountConvention, InvestmentType, PayoutFrequency } from '../../api/types';
import { Alert, Async, Button, Card, cx, errorMessage, PageHeader, SelectInput, TextArea, TextInput } from '../../components/ui';
import { useAsync } from '../../hooks/useAsync';
import { addMonthsToDate, centsToPlainPesos, formatMXN, formatRateBps, todayInContractZone } from '../../lib/format';
import { capitalizationLabel, dayCountLabel, investmentTypeLabel, investmentTypeReference, payoutFrequencyLabel } from '../../lib/labels';
import { parsePercentToBps, parsePesosToCents } from '../../lib/parse';

type Errors = Partial<Record<'type' | 'investor' | 'code' | 'capital' | 'rate' | 'start' | 'maturity', string>>;

export function InvestmentFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const investors = useAsync(() => api.admin.investors({ active: '1', pageSize: 50 }), []);

  const [form, setForm] = useState({
    investor_user_id: params.get('cliente') ?? '',
    investment_type: '' as InvestmentType | '',
    code: '',
    capital: '',
    rate: '',
    start_date: '',
    maturity_date: '',
    payout_frequency: 'MONTHLY' as PayoutFrequency,
    capitalization_policy: 'NONE' as CapitalizationPolicy,
    day_count_convention: 'ACT_365' as DayCountConvention,
    notes: ''
  });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const errorKey: Partial<Record<keyof typeof form, keyof Errors>> = {
    investor_user_id: 'investor', code: 'code', capital: 'capital', rate: 'rate', start_date: 'start', maturity_date: 'maturity'
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    const ek = errorKey[k];
    if (ek) setErrors((prev) => ({ ...prev, [ek]: undefined }));
    setReviewing(false);
  };

  const capitalCents = parsePesosToCents(form.capital);
  const reference = form.investment_type ? investmentTypeReference[form.investment_type] : null;

  /** Prellena capital, tasa y vencimiento con las condiciones de referencia del ramo (editables). */
  const applyReference = () => {
    if (!reference) return;
    const start = form.start_date || todayInContractZone();
    setForm((f) => ({
      ...f,
      capital: centsToPlainPesos(reference.capital_cents),
      rate: formatRateBps(reference.rate_bps).replace(' %', ''),
      start_date: start,
      maturity_date: addMonthsToDate(start, reference.months) ?? f.maturity_date
    }));
    setReviewing(false);
  };
  const rateBps = parsePercentToBps(form.rate);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.investment_type) e.type = 'Seleccione el tipo de inversión.';
    if (!form.investor_user_id) e.investor = 'Seleccione al inversionista.';
    if (!/^[A-Z0-9-]{3,30}$/i.test(form.code.trim())) e.code = 'Use de 3 a 30 letras, números o guiones.';
    if (capitalCents === null || capitalCents <= 0) e.capital = 'Escriba un monto válido, por ejemplo 500,000.00';
    if (rateBps === null || rateBps <= 0) e.rate = 'Escriba la tasa anual, por ejemplo 14 o 14.25';
    if (!form.start_date) e.start = 'Indique la fecha de inicio.';
    if (!form.maturity_date) e.maturity = 'Indique la fecha de vencimiento.';
    else if (form.start_date && form.maturity_date <= form.start_date) e.maturity = 'Debe ser posterior a la fecha de inicio.';
    return e;
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!reviewing) return setReviewing(true); // Paso de revisión antes de guardar
    setPending(true);
    setError(null);
    try {
      const res = await api.admin.createInvestment({
        investor_user_id: form.investor_user_id,
        investment_type: form.investment_type as InvestmentType,
        code: form.code.trim().toUpperCase(),
        capital_cents: capitalCents!,
        fixed_annual_rate_bps: rateBps!,
        start_date: form.start_date,
        maturity_date: form.maturity_date,
        payout_frequency: form.payout_frequency,
        capitalization_policy: form.capitalization_policy,
        day_count_convention: form.day_count_convention,
        notes: form.notes.trim() || undefined
      });
      navigate(`/admin/inversiones/${res.investment_id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setReviewing(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Nueva inversión" subtitle="Registre las condiciones tal como aparecen en el contrato firmado." />
      <Card>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {error && <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div>}

          <fieldset className="sm:col-span-2">
            <legend className="label">Tipo de inversión</legend>
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup">
              {(Object.keys(investmentTypeLabel) as InvestmentType[]).map((t) => {
                const ref = investmentTypeReference[t];
                const selected = form.investment_type === t;
                return (
                  <label
                    key={t}
                    className={cx(
                      'flex cursor-pointer flex-col rounded-lg border-2 p-3 transition',
                      selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-brand/50'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="investment_type"
                        value={t}
                        checked={selected}
                        onChange={() => { setForm((f) => ({ ...f, investment_type: t })); setErrors((prev) => ({ ...prev, type: undefined })); setReviewing(false); }}
                        className="h-4 w-4 accent-[rgb(var(--brand))]"
                      />
                      <span className="font-semibold text-ink">{investmentTypeLabel[t]}</span>
                    </span>
                    <span className="mt-1 text-xs text-ink-muted">
                      Referencia: {formatMXN(ref.capital_cents)} · {ref.months} meses · {formatRateBps(ref.rate_bps)}
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.type && <p className="mt-1 text-xs font-medium text-bad">{errors.type}</p>}
            {reference && (
              <Button type="button" variant="secondary" className="mt-3" onClick={applyReference}>
                Usar condiciones de referencia de {investmentTypeLabel[form.investment_type as InvestmentType]}
              </Button>
            )}
          </fieldset>

          <div className="sm:col-span-2">
            <Async state={investors}>
              {(res) => (
                <SelectInput label="Inversionista" value={form.investor_user_id} onChange={set('investor_user_id')} error={errors.investor}>
                  <option value="">Seleccione…</option>
                  {res.data.map((i) => (
                    <option key={i.id} value={i.id}>{i.full_name ?? i.email} — {i.email}</option>
                  ))}
                </SelectInput>
              )}
            </Async>
          </div>

          <TextInput label="Código de contrato" value={form.code} onChange={set('code')} error={errors.code} hint="Ejemplo: INV-2026-001" />
          <TextInput
            label="Capital (MXN)"
            inputMode="decimal"
            value={form.capital}
            onChange={set('capital')}
            error={errors.capital}
            hint={capitalCents ? `Se registrará: ${formatMXN(capitalCents, { withCode: true })}` : 'Ejemplo: 500,000.00'}
          />
          <TextInput
            label="Tasa anual fija (%)"
            inputMode="decimal"
            value={form.rate}
            onChange={set('rate')}
            error={errors.rate}
            hint={rateBps ? `Se registrará: ${formatRateBps(rateBps)} anual (${rateBps} pb)` : 'Ejemplo: 14 o 14.25'}
          />
          <SelectInput label="Cobro del rendimiento" value={form.payout_frequency} onChange={set('payout_frequency')} hint={form.payout_frequency === 'AT_MATURITY' ? 'Pendiente de confirmar si incluye la devolución del capital.' : undefined}>
            {(Object.keys(payoutFrequencyLabel) as PayoutFrequency[]).map((k) => <option key={k} value={k}>{payoutFrequencyLabel[k]}</option>)}
          </SelectInput>
          <TextInput label="Fecha de inicio" type="date" value={form.start_date} onChange={set('start_date')} error={errors.start} />
          <TextInput label="Fecha de vencimiento" type="date" value={form.maturity_date} onChange={set('maturity_date')} error={errors.maturity} />
          <SelectInput label="Destino del rendimiento (según contrato)" value={form.capitalization_policy} onChange={set('capitalization_policy')} hint="La reinversión solo se aplica cuando la administración la confirma.">
            {(Object.keys(capitalizationLabel) as CapitalizationPolicy[]).map((k) => <option key={k} value={k}>{capitalizationLabel[k]}</option>)}
          </SelectInput>
          <SelectInput label="Convención de días" value={form.day_count_convention} onChange={set('day_count_convention')} hint="Pendiente de aprobación por escrito del cliente.">
            {(Object.keys(dayCountLabel) as DayCountConvention[]).map((k) => <option key={k} value={k}>{dayCountLabel[k]}</option>)}
          </SelectInput>
          <div className="sm:col-span-2"><TextArea label="Notas internas (opcional)" value={form.notes} onChange={set('notes')} /></div>

          {reviewing && (
            <div className="sm:col-span-2">
              <Alert tone="warn" title="Revise antes de guardar">
                {investmentTypeLabel[form.investment_type as InvestmentType]}: {formatMXN(capitalCents, { withCode: true })} al {formatRateBps(rateBps)} anual fija, cobro {payoutFrequencyLabel[form.payout_frequency].toLowerCase()},
                {' '}{capitalizationLabel[form.capitalization_policy].toLowerCase()}, del {form.start_date} al {form.maturity_date}. Si todo es correcto, presione “Confirmar y guardar”.
              </Alert>
            </div>
          )}

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={pending}>{reviewing ? 'Confirmar y guardar' : 'Revisar'}</Button>
            <Link to="/admin/inversiones" className="inline-flex min-h-[44px] items-center px-4 text-sm font-semibold text-ink-2">Cancelar</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
