import { Navigate, Route, Routes } from 'react-router-dom';
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
import { YieldsPage } from './pages/admin/YieldsPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { DashboardPage } from './pages/investor/DashboardPage';
import { InvestmentDetailPage } from './pages/investor/InvestmentDetailPage';
import { InvestmentsPage } from './pages/investor/InvestmentsPage';
import { NotificationsPage } from './pages/investor/NotificationsPage';
import { ProfilePage } from './pages/investor/ProfilePage';

function RootRedirect() {
  const { status, session } = useAuth();
  if (status === 'loading') return <FullPageLoading />;
  return <Navigate to={session ? homeFor(session.user.role) : '/login'} replace />;
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <EmptyState title="Página no encontrada" action={<LinkButton to="/">Ir al inicio</LinkButton>} />
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
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
