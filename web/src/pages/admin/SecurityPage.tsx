import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import type { MfaSetup } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { ChangePasswordForm } from '../../components/ChangePasswordForm';
import { Alert, Badge, Button, Card, errorMessage, PageHeader, TextInput } from '../../components/ui';

export function SecurityPage() {
  const { session, refresh } = useAuth();
  const [enabled, setEnabled] = useState(!!session?.user.mfa_enabled);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const start = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      setSetup(await api.auth.mfaSetup());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!/^\d{6}$/.test(code)) return setError('Escriba el código de 6 dígitos.');
    setPending(true);
    setError(null);
    try {
      await api.auth.mfaVerify(code);
      setEnabled(true);
      setSetup(null);
      await refresh().catch(() => undefined);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PageHeader title="Seguridad" />
      <div className="space-y-6">
        <Card title="Verificación en dos pasos (MFA)" actions={enabled ? <Badge tone="ok">Activa</Badge> : <Badge tone="bad">Inactiva</Badge>}>
          {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}
          {enabled ? (
            <p className="text-sm text-ink-2">Cada inicio de sesión de administración pide un código temporal de su aplicación de autenticación.</p>
          ) : setup ? (
            <form onSubmit={verify} noValidate className="max-w-md space-y-4">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-2">
                <li>Abra su aplicación de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, etc.).</li>
                <li>
                  Agregue una cuenta con esta clave:
                  <code className="mt-1 block select-all break-all rounded bg-sunken p-2 text-ink">{setup.secret}</code>
                </li>
                <li>Escriba el código de 6 dígitos que muestra la aplicación.</li>
              </ol>
              <TextInput label="Código de verificación" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button type="submit" loading={pending}>Activar MFA</Button>
            </form>
          ) : (
            <div className="space-y-3">
              <Alert tone="warn">La verificación en dos pasos es obligatoria para administradores.</Alert>
              <Button onClick={start} loading={pending} icon="shield">Configurar ahora</Button>
            </div>
          )}
        </Card>
        <Card title="Cambiar contraseña">
          <ChangePasswordForm />
        </Card>
      </div>
    </>
  );
}
