import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { isEmail } from '../../lib/parse';
import { PASSWORD_HINT, passwordProblems } from '../../lib/password';
import { Modal } from '../Modal';
import { Alert, Button, errorMessage, TextInput } from '../ui';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L: se dicta sin confusiones
const pick = (n: number, chars: string) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => chars[x % chars.length]).join('');
/** Contraseña temporal sugerida, p. ej. «Pimex-K7QM-48»: cumple la política (letras y números, 13 caracteres). */
export const temporaryPassword = () => `Pimex-${pick(4, ALPHABET)}-${pick(2, '23456789')}`;

type Sent = { email: string; sent: boolean }[];

/** Restablecimiento asistido: el administrador asigna una contraseña temporal que se envía por correo al cliente. */
export function ResetPasswordModal({ open, client, onClose }: { open: boolean; client: { id: string; email: string; name: string }; onClose: () => void }) {
  const [password, setPassword] = useState(temporaryPassword);
  const [extra, setExtra] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Sent | null>(null);

  const close = () => {
    setPassword(temporaryPassword());
    setExtra('');
    setError(null);
    setResult(null);
    onClose();
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (pending) return;
    const problem = passwordProblems(password, password);
    if (problem) return setError(problem);
    if (extra.trim() && !isEmail(extra)) return setError('El correo adicional no es válido.');
    setError(null);
    setPending(true);
    try {
      setResult((await api.admin.resetInvestorPassword(client.id, { password, extra_email: extra.trim() || undefined })).emails);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const failed = result?.filter((r) => !r.sent) ?? [];

  return (
    <Modal
      open={open}
      title="Restablecer contraseña"
      onClose={close}
      footer={
        result ? (
          <Button onClick={close}>Listo</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button loading={pending} onClick={() => submit()}>Restablecer y enviar</Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <Alert tone="ok" title="Contraseña restablecida">
            Las sesiones abiertas del cliente se cerraron. Ya puede entrar con la contraseña temporal.
          </Alert>
          <ul className="space-y-1 text-sm">
            {result.map((r) => (
              <li key={r.email} className={r.sent ? 'text-ink-2' : 'text-bad'}>
                {r.sent ? 'Enviada a' : 'No se pudo enviar a'} <strong className="text-ink">{r.email}</strong>
              </li>
            ))}
          </ul>
          {failed.length > 0 && (
            <Alert tone="warn">
              Comparta la contraseña <strong className="tabular">{password}</strong> por otro medio seguro (por ejemplo, por teléfono).
            </Alert>
          )}
        </div>
      ) : (
        <form noValidate className="space-y-4" onSubmit={submit}>
          {error && <Alert tone="bad">{error}</Alert>}
          <p className="text-sm text-ink-2">
            Se asignará una contraseña temporal a <strong className="text-ink">{client.name}</strong> y se enviará a su correo registrado
            (<strong className="text-ink">{client.email}</strong>). Sus sesiones abiertas se cerrarán y la contraseña anterior dejará de funcionar.
          </p>
          <TextInput label="Contraseña temporal" autoComplete="off" spellCheck={false} value={password} onChange={(e) => setPassword(e.target.value)} hint={`Sugerida automáticamente; puede cambiarla. ${PASSWORD_HINT}`} />
          <TextInput label="Correo adicional (opcional)" type="email" autoComplete="off" value={extra} onChange={(e) => setExtra(e.target.value)} hint="Recibirá el mismo mensaje; por ejemplo, el de su asistente o contador." />
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}
