import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Alert, Button, errorMessage, TextInput } from '../../components/ui';
import { isEmail } from '../../lib/parse';
import { AuthLayout } from './AuthLayout';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    if (!isEmail(email)) return setError('Escriba un correo electrónico válido.');
    setError(null);
    setPending(true);
    try {
      await api.auth.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Le enviaremos un enlace a su correo">
      {sent ? (
        <div className="space-y-4">
          {/* Mensaje constante: no revela si el correo existe. */}
          <Alert tone="ok" title="Revise su correo">
            Si el correo está registrado, recibirá un enlace para crear una nueva contraseña. El enlace vence en 1 hora.
          </Alert>
          <Link to="/login" className="block text-center text-sm font-medium text-brand hover:underline">Volver a iniciar sesión</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {error && <Alert tone="bad">{error}</Alert>}
          <TextInput label="Correo electrónico" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" loading={pending}>Enviar enlace</Button>
          <Link to="/login" className="block text-center text-sm font-medium text-brand hover:underline">Volver</Link>
        </form>
      )}
    </AuthLayout>
  );
}
