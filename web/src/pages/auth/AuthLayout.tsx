import type { ReactNode } from 'react';
import { USING_MOCKS } from '../../api';
import { MockBanner } from '../../components/MockBanner';
import { BRAND } from '../../layouts/brand';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-nav">
      <MockBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-10" style={{ backgroundImage: 'radial-gradient(ellipse at top, rgb(var(--nav-active) / 0.9), transparent 60%)' }}>
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={BRAND.plateSrc} alt="Verticimax México Star Up" className="mb-4 w-56 rounded-2xl shadow-lg ring-1 ring-white/20" />
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-nav-ink">{subtitle}</p>}
          </div>
          <div className="rounded-card border border-line bg-surface p-5 shadow-xl sm:p-6">{children}</div>
          {USING_MOCKS && (
            <div className="mt-4 rounded-lg border border-dashed border-white/30 p-3 text-xs text-nav-ink">
              <p className="font-semibold text-white">Accesos de prueba (datos FICTICIOS)</p>
              <p>Inversionista: hector.galeana@ficticio.test</p>
              <p>Administración: admin@ficticio.test · código MFA 123456</p>
              <p>Contraseña de ambos: Ficticio123!</p>
            </div>
          )}
          <p className="mt-6 text-center text-xs text-nav-ink/80">Acceso privado y exclusivo para inversionistas de {BRAND.name}.</p>
        </div>
      </main>
    </div>
  );
}
