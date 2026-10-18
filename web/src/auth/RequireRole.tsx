import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '../api/types';
import { useAuth } from './AuthContext';
import { FullPageLoading } from '../components/ui';

/** Protege rutas por rol. La autorización real la hace el servidor; esto solo evita mostrar pantallas ajenas. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoading />;
  if (status === 'anonymous' || !session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (session.user.role !== role) {
    return <Navigate to={homeFor(session.user.role)} replace />;
  }
  return <>{children}</>;
}

export const homeFor = (role: Role) => (role === 'ADMIN' ? '/admin' : '/app');
