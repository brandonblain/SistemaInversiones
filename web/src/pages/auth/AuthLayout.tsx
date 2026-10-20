import type { ReactNode } from 'react';
import { USING_MOCKS } from '../../api';
import { MockBanner } from '../../components/MockBanner';
import { Link } from 'react-router-dom';
import { BRAND } from '../../layouts/brand';
import { usePrivatePage } from '../../layouts/usePrivatePage';
import { publicHref } from '../../lib/site';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  usePrivatePage();
  return (
    <div className="flex min-h-screen flex-col bg-nav">
      <MockBanner />
      <main className="flex flex-1 items-center justify-center px-4 py-10" style={{ backgroundImage: 'radial-gradient(ellipse at top, oklch(var(--nav-active) / 0.9), transparent 60%)' }}>
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={BRAND.emblemDarkSrc} alt="" width={224} height={68} className="w-56 max-w-full" />
            <p className="font-display mb-6 mt-3 text-lg font-extrabold uppercase leading-tight tracking-wide text-white [font-stretch:112%]">
              Pimex Fortex
              <span className="block text-xs font-semibold tracking-[0.35em] text-nav-ink">Capital</span>
            </p>
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
          <p className="mt-3 text-center text-sm">
            {publicHref() === '/' ? (
              <Link to="/" className="inline-flex min-h-[44px] items-center font-semibold text-white hover:underline">← Volver al sitio</Link>
            ) : (
              <a href={publicHref()} className="inline-flex min-h-[44px] items-center font-semibold text-white hover:underline">← Volver al sitio</a>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
