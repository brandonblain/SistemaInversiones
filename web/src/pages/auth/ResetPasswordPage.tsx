import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Alert, Button, errorMessage, TextInput } from '../../components/ui';
import { PASSWORD_HINT, passwordProblems } from '../../lib/password';
import { AuthLayout } from './AuthLayout';

/**
 * Enlace esperado: /restablecer?token=rst_...
 * El token se retira de la barra de direcciones al cargar para que no quede en el historial.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get('token') ?? '');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (params.has('token')) window.history.replaceState(null, '', window.location.pathname);
  }, [params]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const problem = passwordProblems(pw, confirm);
    if (problem) return setError(problem);
    setError(null);
    setPending(true);
    try {
      await api.auth.resetPassword(token, pw);
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Enlace no válido">
        <Alert tone="bad">El enlace de recuperación está incompleto o ya se utilizó.</Alert>
        <Link to="/recuperar" className="mt-4 block text-center text-sm font-medium text-brand hover:underline">Solicitar un enlace nuevo</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nueva contraseña">
      {done ? (
        <div className="space-y-4">
          <Alert tone="ok" title="Contraseña actualizada">Por seguridad, se cerraron sus sesiones abiertas. Inicie sesión con su nueva contraseña.</Alert>
          <Link to="/login" className="block text-center text-sm font-medium text-brand hover:underline">Iniciar sesión</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="bad">{error}</Alert>}
          <TextInput label="Nueva contraseña" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint={PASSWORD_HINT} />
          <TextInput label="Confirmar contraseña" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          <Button type="submit" className="w-full" loading={pending}>Guardar contraseña</Button>
        </form>
      )}
    </AuthLayout>
  );
}
