import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { setUnauthorizedHandler } from '../api/client';
import type { LoginInput, Session } from '../api/types';
import { site } from '../lib/site';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthState {
  status: Status;
  session: Session | null;
  /** Mensaje para la pantalla de login (p. ej. sesión expirada). */
  notice: string | null;
  login(input: LoginInput): Promise<Session>;
  logout(): Promise<void>;
  /** Vuelve a leer /api/auth/me (p. ej. tras activar MFA). */
  refresh(): Promise<void>;
  clearNotice(): void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * La sesión se mantiene SOLO en memoria. Al cargar la app se consulta /api/auth/me, que depende de la
 * cookie HttpOnly. No se guardan tokens ni datos financieros en localStorage/sessionStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    // El sitio público no tiene API ni recibe la cookie del portal: siempre es anónimo.
    if (site().kind === 'public') {
      setStatus('anonymous');
      return;
    }
    let alive = true;
    api.auth
      .me()
      .then((s) => {
        if (!alive) return;
        setSession(s);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!alive) return;
        setSession(null);
        setStatus('anonymous');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (statusRef.current !== 'authenticated') return;
      setSession(null);
      setStatus('anonymous');
      setNotice('Su sesión expiró o se cerró en otro dispositivo. Inicie sesión de nuevo.');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const s = await api.auth.login(input);
    setSession(s);
    setStatus('authenticated');
    setNotice(null);
    return s;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setSession(null);
      setStatus('anonymous');
    }
  }, []);

  const refresh = useCallback(async () => {
    setSession(await api.auth.me());
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, session, notice, login, logout, refresh, clearNotice: () => setNotice(null) }),
    [status, session, notice, login, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
