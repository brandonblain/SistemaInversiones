import { AppShell, type NavItem } from './AppShell';

// El inversionista solo ve consulta: sin documentos, controles administrativos, transferencias ni retiros.
const nav: NavItem[] = [
  { to: '/app', label: 'Inicio', icon: 'home', end: true, mobile: true },
  { to: '/app/inversiones', label: 'Inversiones', icon: 'list', mobile: true },
  { to: '/app/avisos', label: 'Avisos', icon: 'bell', mobile: true },
  { to: '/app/perfil', label: 'Perfil', icon: 'user', mobile: true }
];

export function InvestorLayout() {
  return <AppShell nav={nav} areaLabel="Área de inversionista" mobileStyle="bottom" />;
}
