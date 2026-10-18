import { api } from '../../api';
import type { AdminInvestmentRow } from '../../api/types';
import { useAsync } from '../../hooks/useAsync';
import { investmentStatusLabel, investmentTypeLabel } from '../../lib/labels';
import { Async, SelectInput } from '../ui';

/** Selector de inversión (≈15 inversionistas: una sola página de hasta 50 contratos basta para el MVP). */
export function InvestmentPicker({ value, onChange, label = 'Inversión' }: { value: string; onChange: (id: string, row?: AdminInvestmentRow) => void; label?: string }) {
  const list = useAsync(() => api.admin.investments({ pageSize: 50 }), []);
  return (
    <Async state={list}>
      {(res) => (
        <SelectInput label={label} value={value} onChange={(e) => onChange(e.target.value, res.data.find((r) => r.id === e.target.value))}>
          <option value="">Seleccione una inversión…</option>
          {res.data.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} · {investmentTypeLabel[r.investment_type]} · {r.investor_name ?? r.investor_email} · {investmentStatusLabel[r.status]}
            </option>
          ))}
        </SelectInput>
      )}
    </Async>
  );
}
