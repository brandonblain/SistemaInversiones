import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { BeneficiariesEditor, validateBeneficiaries, type BeneficiaryDraft } from '../../components/admin/BeneficiariesEditor';
import { Alert, Button, Card, errorMessage, PageHeader, TextArea, TextInput } from '../../components/ui';
import { isEmail } from '../../lib/parse';
import { PASSWORD_HINT, passwordProblems } from '../../lib/password';

type Errors = Partial<Record<'email' | 'full_name' | 'password' | 'rfc' | 'beneficiaries', string>>;

export function InvestorFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', rfc: '', address: '', notes: '', password: '', confirm: '' });
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryDraft[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending) return;
    const e: Errors = {};
    if (form.full_name.trim().length < 3) e.full_name = 'Escriba el nombre completo.';
    if (!isEmail(form.email)) e.email = 'Correo no válido.';
    if (form.rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(form.rfc.trim())) e.rfc = 'RFC con formato no válido (12 o 13 caracteres).';
    const pw = passwordProblems(form.password, form.confirm);
    if (pw) e.password = pw;
    const bens = validateBeneficiaries(beneficiaries);
    if (!bens.ok) e.beneficiaries = bens.error;
    setErrors(e);
    if (Object.keys(e).length || !bens.ok) return;

    setPending(true);
    setError(null);
    try {
      const res = await api.admin.createInvestor({
        email: form.email.trim(),
        password: form.password,
        full_name: form.full_name.trim(),
        rfc: form.rfc.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
        beneficiaries: bens.value
      });
      navigate(`/admin/clientes/${res.user_id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Nuevo cliente" subtitle="Se creará su cuenta de acceso al portal con rol de inversionista." />
      <Card>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          {error && <div className="sm:col-span-2"><Alert tone="bad">{error}</Alert></div>}
          <div className="sm:col-span-2"><TextInput label="Nombre completo" value={form.full_name} onChange={set('full_name')} error={errors.full_name} /></div>
          <TextInput label="Correo electrónico (usuario)" type="email" value={form.email} onChange={set('email')} error={errors.email} autoComplete="off" />
          <TextInput label="Teléfono (opcional)" type="tel" value={form.phone} onChange={set('phone')} />
          <TextInput label="RFC (opcional)" value={form.rfc} onChange={set('rfc')} error={errors.rfc} />
          <TextInput label="Domicilio (opcional)" value={form.address} onChange={set('address')} />
          <div className="sm:col-span-2"><TextArea label="Notas internas (no visibles para el inversionista)" value={form.notes} onChange={set('notes')} /></div>

          <div className="border-t border-line pt-4 sm:col-span-2">
            {errors.beneficiaries && <div className="mb-3"><Alert tone="bad">{errors.beneficiaries}</Alert></div>}
            <BeneficiariesEditor rows={beneficiaries} onChange={setBeneficiaries} />
          </div>

          <div className="border-t border-line pt-4 sm:col-span-2">
            <p className="mb-3 text-sm font-semibold text-ink">Acceso al portal</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Contraseña temporal" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} hint={PASSWORD_HINT} />
              <TextInput label="Confirmar contraseña temporal" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Alert tone="info">Entregue la contraseña temporal por un medio seguro y pida al inversionista cambiarla en su primer acceso.</Alert>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" loading={pending}>Crear cliente</Button>
            <Link to="/admin/clientes" className="inline-flex min-h-[44px] items-center px-4 text-sm font-semibold text-ink-2">Cancelar</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
