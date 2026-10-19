import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppShell, type NavItem } from './AppShell';

const nav: NavItem[] = [
  { to: '/admin', label: 'Resumen', icon: 'chart', end: true },
  { to: '/admin/estadisticas', label: 'Estadísticas', icon: 'table' },
  { to: '/admin/clientes', label: 'Inversionistas', icon: 'users' },
  { to: '/admin/inversiones', label: 'Inversiones', icon: 'list' },
  { to: '/admin/rendimientos', label: 'Rendimientos', icon: 'percent' },
  { to: '/admin/pagos', label: 'Pagos externos', icon: 'cash' },
  { to: '/admin/tasas', label: 'Tasas CETES', icon: 'chart' },
  { to: '/admin/documentos', label: 'Documentos', icon: 'file' },
  { to: '/admin/avisos', label: 'Avisos por correo', icon: 'bell' },
  { to: '/admin/bitacora', label: 'Bitácora', icon: 'clock' },
  { to: '/admin/seguridad', label: 'Seguridad (MFA)', icon: 'shield' }
];

export function AdminLayout() {
  const { session } = useAuth();
  const banner =
    session && !session.user.mfa_enabled ? (
      <div role="alert" className="border-b border-bad/40 bg-bad-soft px-4 py-2 text-sm text-ink">
        <strong>La verificación en dos pasos (MFA) no está activa.</strong> Es obligatoria para administradores.{' '}
        <Link to="/admin/seguridad" className="font-semibold text-brand underline">Activarla ahora</Link>
      </div>
    ) : null;
  return <AppShell nav={nav} areaLabel="Administración" mobileStyle="drawer" banner={banner} />;
}
