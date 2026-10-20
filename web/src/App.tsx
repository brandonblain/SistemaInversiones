import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { homeFor, RequireRole } from './auth/RequireRole';
import { EmptyState, FullPageLoading, LinkButton } from './components/ui';
import { AdminLayout } from './layouts/AdminLayout';
import { InvestorLayout } from './layouts/InvestorLayout';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminDocumentsPage } from './pages/admin/AdminDocumentsPage';
import { AdminInvestmentDetailPage } from './pages/admin/AdminInvestmentDetailPage';
import { AdminInvestmentsPage } from './pages/admin/AdminInvestmentsPage';
import { AdminNotificationsPage } from './pages/admin/AdminNotificationsPage';
import { AuditLogPage } from './pages/admin/AuditLogPage';
import { InvestmentFormPage } from './pages/admin/InvestmentFormPage';
import { InvestorDetailPage } from './pages/admin/InvestorDetailPage';
import { InvestorFormPage } from './pages/admin/InvestorFormPage';
import { InvestorsPage } from './pages/admin/InvestorsPage';
import { PaymentsPage } from './pages/admin/PaymentsPage';
import { ReferenceRatesPage } from './pages/admin/ReferenceRatesPage';
import { SecurityPage } from './pages/admin/SecurityPage';
import { StatisticsPage } from './pages/admin/StatisticsPage';
import { YieldsPage } from './pages/admin/YieldsPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { DashboardPage } from './pages/investor/DashboardPage';
import { InvestmentDetailPage } from './pages/investor/InvestmentDetailPage';
import { InvestmentsPage } from './pages/investor/InvestmentsPage';
import { NotificationsPage } from './pages/investor/NotificationsPage';
import { ProfilePage } from './pages/investor/ProfilePage';
import { LandingPage } from './pages/public/LandingPage';
import { LegalDocPage, LegalIndexPage } from './pages/public/LegalPages';
import { isPortalPath, portalHref, site } from './lib/site';

function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState title="Página no encontrada" action={<LinkButton to="/">Ir al inicio</LinkButton>} />
    </div>
  );
}

/** Raíz del portal de clientes: sin sesión muestra el login; con sesión, el panel de su rol. */
function PortalHome() {
  const { status, session } = useAuth();
  if (status === 'loading') return <FullPageLoading />;
  if (status === 'authenticated' && session) return <Navigate to={homeFor(session.user.role)} replace />;
  return <LoginPage />;
}

/** Navegación a otro dominio (sitio público → portal). El Worker hace lo mismo en cargas directas. */
function ExternalRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return <FullPageLoading />;
}

/** Sitio público: solo la página corporativa; las rutas del portal se envían al subdominio de clientes. */
function PublicFallback() {
  const { pathname, search } = useLocation();
  return isPortalPath(pathname) ? <ExternalRedirect to={portalHref(pathname + search)} /> : <NotFound />;
}

export function App() {
  const kind = site().kind;
  if (kind === 'public') {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/legal" element={<LegalIndexPage />} />
        <Route path="/legal/:slug" element={<LegalDocPage />} />
        <Route path="*" element={<PublicFallback />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/" element={kind === 'portal' ? <PortalHome /> : <LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/legal" element={<LegalIndexPage />} />
      <Route path="/legal/:slug" element={<LegalDocPage />} />
      <Route path="/recuperar" element={<ForgotPasswordPage />} />
      <Route path="/restablecer" element={<ResetPasswordPage />} />

      <Route path="/app" element={<RequireRole role="INVESTOR"><InvestorLayout /></RequireRole>}>
        <Route index element={<DashboardPage />} />
        <Route path="inversiones" element={<InvestmentsPage />} />
        <Route path="inversiones/:id" element={<InvestmentDetailPage />} />
        <Route path="avisos" element={<NotificationsPage />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin" element={<RequireRole role="ADMIN"><AdminLayout /></RequireRole>}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="estadisticas" element={<StatisticsPage />} />
        <Route path="clientes" element={<InvestorsPage />} />
        <Route path="clientes/nuevo" element={<InvestorFormPage />} />
        <Route path="clientes/:id" element={<InvestorDetailPage />} />
        <Route path="inversiones" element={<AdminInvestmentsPage />} />
        <Route path="inversiones/nueva" element={<InvestmentFormPage />} />
        <Route path="inversiones/:id" element={<AdminInvestmentDetailPage />} />
        <Route path="rendimientos" element={<YieldsPage />} />
        <Route path="pagos" element={<PaymentsPage />} />
        <Route path="tasas" element={<ReferenceRatesPage />} />
        <Route path="documentos" element={<AdminDocumentsPage />} />
        <Route path="avisos" element={<AdminNotificationsPage />} />
        <Route path="bitacora" element={<AuditLogPage />} />
        <Route path="seguridad" element={<SecurityPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
