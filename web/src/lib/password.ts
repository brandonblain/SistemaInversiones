/** Reglas mínimas de interfaz; el servidor es quien valida definitivamente. */
export function passwordProblems(pw: string, confirm: string): string | null {
  if (pw.length < 10) return 'Use al menos 10 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(pw) || !/\d/.test(pw)) return 'Combine letras y números.';
  if (pw !== confirm) return 'Las contraseñas no coinciden.';
  return null;
}

export const PASSWORD_HINT = 'Mínimo 10 caracteres, con letras y números. Evite datos personales.';
