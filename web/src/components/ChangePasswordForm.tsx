import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { PASSWORD_HINT, passwordProblems } from '../lib/password';
import { Alert, Button, errorMessage, TextInput } from './ui';

export function ChangePasswordForm() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setDone(false);
    if (!current) return setError('Escriba su contraseña actual.');
    const p = passwordProblems(next, confirm);
    if (p) return setError(p);
    if (next === current) return setError('La nueva contraseña debe ser distinta de la actual.');
    setError(null);
    setPending(true);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate className="max-w-md space-y-4" onSubmit={onSubmit}>
      {error && <Alert tone="bad">{error}</Alert>}
      {done && <Alert tone="ok">Contraseña actualizada. Recibirá un aviso de seguridad por correo.</Alert>}
      <TextInput label="Contraseña actual" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <TextInput label="Nueva contraseña" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint={PASSWORD_HINT} />
      <TextInput label="Confirmar nueva contraseña" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <Button type="submit" loading={pending}>Cambiar contraseña</Button>
    </form>
  );
}
