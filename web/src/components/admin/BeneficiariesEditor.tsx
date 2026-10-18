import type { Relationship } from '../../api/types';
import { formatRateBps } from '../../lib/format';
import { relationshipLabel } from '../../lib/labels';
import { parsePercentToBps } from '../../lib/parse';
import { Icon } from '../icons';
import { Button, cx, SelectInput, TextInput } from '../ui';

export interface BeneficiaryDraft {
  key: number;
  full_name: string;
  relationship: Relationship | '';
  percentage: string;
}

let nextKey = 1;
export const emptyBeneficiary = (): BeneficiaryDraft => ({ key: nextKey++, full_name: '', relationship: '', percentage: '' });

/** Valida la captura y devuelve los beneficiarios listos para la API, o un mensaje de error. */
export function validateBeneficiaries(rows: BeneficiaryDraft[]):
  | { ok: true; value: Array<{ full_name: string; relationship: Relationship; percentage_bps: number }> }
  | { ok: false; error: string } {
  const value = [];
  for (const [i, r] of rows.entries()) {
    const n = i + 1;
    if (r.full_name.trim().length < 3) return { ok: false, error: `Beneficiario ${n}: escriba el nombre completo.` };
    if (!r.relationship) return { ok: false, error: `Beneficiario ${n}: seleccione el parentesco.` };
    const bps = parsePercentToBps(r.percentage);
    if (bps === null || bps <= 0 || bps > 10_000) return { ok: false, error: `Beneficiario ${n}: el porcentaje debe ser mayor a 0 y hasta 100.` };
    value.push({ full_name: r.full_name.trim(), relationship: r.relationship, percentage_bps: bps });
  }
  const total = value.reduce((s, b) => s + b.percentage_bps, 0);
  if (value.length > 0 && total !== 10_000) {
    return { ok: false, error: `Los porcentajes de los beneficiarios suman ${formatRateBps(total)}; deben sumar 100 %.` };
  }
  return { ok: true, value };
}

export function BeneficiariesEditor({ rows, onChange }: { rows: BeneficiaryDraft[]; onChange: (rows: BeneficiaryDraft[]) => void }) {
  const update = (key: number, patch: Partial<BeneficiaryDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // Suma de lo capturado (validación de formulario).
  const total = rows.reduce((s, r) => s + (parsePercentToBps(r.percentage) ?? 0), 0);

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-ink">Beneficiarios</legend>
      <p className="text-xs text-ink-muted">Opcional. Si agrega beneficiarios, sus porcentajes deben sumar 100 %.</p>

      {rows.map((r, i) => (
        <div key={r.key} className="grid items-end gap-3 rounded-lg border border-line bg-sunken/50 p-3 sm:grid-cols-[1fr_180px_120px_auto]">
          <TextInput label={`Nombre del beneficiario ${i + 1}`} value={r.full_name} onChange={(e) => update(r.key, { full_name: e.target.value })} />
          <SelectInput label="Parentesco" value={r.relationship} onChange={(e) => update(r.key, { relationship: e.target.value as Relationship })}>
            <option value="">Seleccione…</option>
            {(Object.keys(relationshipLabel) as Relationship[]).map((k) => <option key={k} value={k}>{relationshipLabel[k]}</option>)}
          </SelectInput>
          <TextInput label="Porcentaje (%)" inputMode="decimal" value={r.percentage} onChange={(e) => update(r.key, { percentage: e.target.value })} />
          <button
            type="button"
            onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
            className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg px-3 text-sm font-semibold text-bad hover:bg-bad-soft"
            aria-label={`Quitar beneficiario ${i + 1}`}
          >
            <Icon name="x" className="h-4 w-4" /> Quitar
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" icon="plus" onClick={() => onChange([...rows, emptyBeneficiary()])}>
          Agregar beneficiario
        </Button>
        {rows.length > 0 && (
          <p className={cx('text-sm font-semibold', total === 10_000 ? 'text-ok' : 'text-warn')} aria-live="polite">
            Total: {formatRateBps(total)} de 100 %
          </p>
        )}
      </div>
    </fieldset>
  );
}
