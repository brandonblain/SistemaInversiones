import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { homeFor } from '../../auth/RequireRole';
import { Alert, Button, errorMessage, TextInput } from '../../components/ui';
import { isEmail } from '../../lib/parse';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login, status, session, notice, clearNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfa, setMfa] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (status === 'authenticated' && session) {
    return <Navigate to={homeFor(session.user.role)} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    clearNotice();
    if (!isEmail(email)) return setError('Escriba un correo electrónico válido.');
    if (!password) return setError('Escriba su contraseña.');
    if (needsMfa && !/^\d{6}$/.test(mfa.trim())) return setError('El código de verificación tiene 6 dígitos.');

    setPending(true);
    try {
      const s = await login({ email, password, ...(needsMfa ? { mfa_token: mfa.trim() } : {}) });
      const home = homeFor(s.user.role);
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'MFA_REQUIRED') {
        setNeedsMfa(true);
      } else if (err instanceof ApiError && err.code === 'INVALID_CREDENTIALS') {
        setError('Correo o contraseña incorrectos.');
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Iniciar sesión" subtitle={needsMfa ? 'Verificación en dos pasos' : 'Consulte sus contratos y rendimientos'}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {notice && <Alert tone="warn">{notice}</Alert>}
        {error && <Alert tone="bad">{error}</Alert>}

        {!needsMfa ? (
          <>
            <TextInput label="Correo electrónico" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextInput label="Contraseña" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </>
        ) : (
          <>
            <Alert tone="info">Abra su aplicación de autenticación y escriba el código de 6 dígitos.</Alert>
            <TextInput
              label="Código de verificación"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="\d{6}"
              value={mfa}
              onChange={(e) => setMfa(e.target.value.replace(/\D/g, ''))}
              autoFocus
            />
          </>
        )}

        <Button type="submit" className="w-full" loading={pending}>
          {needsMfa ? 'Verificar y entrar' : 'Entrar'}
        </Button>

        <div className="flex justify-between text-sm">
          {needsMfa ? (
            <button type="button" className="inline-flex min-h-[44px] items-center font-medium text-brand hover:underline" onClick={() => { setNeedsMfa(false); setMfa(''); }}>
              Volver
            </button>
          ) : (
            <span />
          )}
          <Link to="/recuperar" className="inline-flex min-h-[44px] items-center font-medium text-brand hover:underline">¿Olvidó su contraseña?</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
