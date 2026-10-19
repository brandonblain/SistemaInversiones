import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Icon, type IconName } from '../components/icons';
import { MockBanner } from '../components/MockBanner';
import { cx } from '../components/ui';
import { BRAND } from './brand';
import { usePrivatePage } from './usePrivatePage';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Mostrar en la barra inferior móvil (máximo 4–5). */
  mobile?: boolean;
}

function BrandMark({ areaLabel, compact = false }: { areaLabel?: string; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src={BRAND.emblemSrc} alt="" className={compact ? 'h-8 w-auto' : 'h-11 w-auto'} />
      <div className="leading-tight">
        <p className={cx('font-extrabold tracking-wide text-white', compact ? 'text-sm' : 'text-base')}>VERTICIMAX</p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-nav-ink">México · Star Up</p>
        {areaLabel && !compact && <p className="mt-1 text-xs text-nav-ink/80">{areaLabel}</p>}
      </div>
    </div>
  );
}

/**
 * Estructura común: barra lateral azul marino en escritorio; en móvil, encabezado azul marino +
 * barra inferior (inversionista) o menú desplegable (administración).
 */
export function AppShell({ nav, areaLabel, mobileStyle, banner }: { nav: NavItem[]; areaLabel: string; mobileStyle: 'bottom' | 'drawer'; banner?: ReactNode }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const name = session?.investor_profile?.full_name ?? session?.user.email ?? '';

  useEffect(() => setDrawer(false), [location.pathname]);
  usePrivatePage();

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const links = (items: NavItem[]) =>
    items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          cx(
            'flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition',
            isActive ? 'bg-nav-active text-white shadow-inner' : 'text-nav-ink hover:bg-nav-hover hover:text-white'
          )
        }
      >
        <Icon name={item.icon} />
        {item.label}
      </NavLink>
    ));

  const logoutButton = (
    <button type="button" onClick={onLogout} className="flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-nav-ink hover:bg-nav-hover hover:text-white">
      <Icon name="logout" /> Cerrar sesión
    </button>
  );

  return (
    <div className="min-h-screen bg-page">
      <MockBanner />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Saltar al contenido
      </a>

      <div className="flex">
        {/* Barra lateral (escritorio) */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-nav lg:flex">
          <div className="border-b border-white/10 px-5 py-5">
            <BrandMark areaLabel={areaLabel} />
          </div>
          <nav aria-label="Navegación principal" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
            {links(nav)}
          </nav>
          <div className="border-t border-white/10 p-3">
            <p className="truncate px-3 pb-2 text-xs text-nav-ink/80" title={name}>{name}</p>
            {logoutButton}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Encabezado móvil */}
          <header className="sticky top-0 z-20 flex items-center justify-between bg-nav px-4 py-2.5 lg:hidden">
            <BrandMark compact />
            {mobileStyle === 'drawer' ? (
              <button type="button" className="rounded-lg p-2 text-white" onClick={() => setDrawer((v) => !v)} aria-expanded={drawer} aria-controls="menu-movil" aria-label="Menú">
                <Icon name={drawer ? 'x' : 'menu'} />
              </button>
            ) : (
              <button type="button" onClick={onLogout} className="rounded-lg p-2 text-white" aria-label="Cerrar sesión">
                <Icon name="logout" />
              </button>
            )}
          </header>
          {mobileStyle === 'drawer' && drawer && (
            <nav id="menu-movil" aria-label="Navegación principal" className="space-y-1 bg-nav p-3 lg:hidden">
              {links(nav)}
              {logoutButton}
            </nav>
          )}

          {banner}

          <main id="contenido" className={cx('mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:py-8', mobileStyle === 'bottom' && 'pb-24 lg:pb-8')}>
            <Outlet />
          </main>

          {mobileStyle === 'bottom' && (
            <nav aria-label="Navegación inferior" className="fixed inset-x-0 bottom-0 z-20 grid border-t border-white/10 bg-nav lg:hidden" style={{ gridTemplateColumns: `repeat(${nav.filter((n) => n.mobile).length}, 1fr)` }}>
              {nav.filter((n) => n.mobile).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'bg-nav-active text-white' : 'text-nav-ink')}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
