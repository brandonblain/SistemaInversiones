// Implementación real contra el Worker (Hono + D1). Rutas según docs/api-contract.md.
// Las marcadas con PROPUESTO no existen aún en el contrato; ver docs/frontend-integraciones-pendientes.md

import { qs, request, requestBlob, requestPage } from './client';
import type { PortalApi } from './portal-api';
import type { InvestmentBalance, InvestmentDetail, Session } from './types';

type RawSession = Session & { token?: string };

/** Descarta cualquier token que venga en el cuerpo: la sesión solo vive en la cookie HttpOnly. */
function toSession(raw: RawSession): Session {
  return { user: raw.user, investor_profile: raw.investor_profile ?? null };
}

/**
 * GET /investments/:id devuelve { investment, summary }. El contrato no fija los nombres del
 * saldo desglosado; se aceptan los nombres que hoy entrega el backend y los snake_case del contrato.
 */
export function normalizeInvestmentDetail(raw: any): InvestmentDetail & Record<string, any> {
  const inv = raw?.investment ?? raw;
  const s = raw?.summary ?? raw?.balance ?? {};
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof s[k] === 'number') return s[k] as number;
    return 0;
  };
  const balance: InvestmentBalance = {
    capital_cents: pick('capital_cents', 'capitalVigenteCents') || inv.current_capital_cents || 0,
    yield_generated_cents: pick('yield_generated_cents', 'rendimientoDevengadoCents'),
    yield_confirmed_cents: pick('yield_confirmed_cents', 'rendimientoConfirmadoCents'),
    yield_paid_cents: pick('yield_paid_cents', 'rendimientoPagadoCents'),
    yield_reinvested_cents: pick('yield_reinvested_cents', 'rendimientoReinvertidoCents'),
    yield_pending_cents: pick('yield_pending_cents', 'rendimientoPendienteCents')
  };
  return { ...inv, balance, current_reference_rate: raw?.current_reference_rate ?? null };
}

export const httpApi: PortalApi = {
  auth: {
    login: async (input) => toSession(await request<RawSession>('POST', '/api/auth/login', input)),
    logout: async () => {
      await request('POST', '/api/auth/logout');
    },
    me: async () => toSession(await request<RawSession>('GET', '/api/auth/me')),
    changePassword: async (current_password, new_password) => {
      await request('POST', '/api/auth/change-password', { current_password, new_password });
    },
    requestPasswordReset: async (email) => {
      await request('POST', '/api/auth/request-password-reset', { email });
    },
    resetPassword: async (token, new_password) => {
      await request('POST', '/api/auth/reset-password', { token, new_password });
    },
    mfaSetup: () => request('POST', '/api/auth/admin/mfa/setup'),
    mfaVerify: async (token) => {
      await request('POST', '/api/auth/admin/mfa/verify', { token });
    }
  },

  investor: {
    summary: () => request('GET', '/api/investor/summary'),
    investments: (q) => requestPage(`/api/investor/investments${qs(q)}`),
    investment: async (id) =>
      normalizeInvestmentDetail(await request('GET', `/api/investor/investments/${encodeURIComponent(id)}`)),
    history: (id, q) => requestPage(`/api/investor/investments/${encodeURIComponent(id)}/history${qs(q)}`),
    // PROPUESTO
    series: (id) => request('GET', `/api/investor/investments/${encodeURIComponent(id)}/series`),
    // PROPUESTO
    notifications: (q) => requestPage(`/api/investor/notifications${qs(q)}`)
  },

  admin: {
    // PROPUESTO
    summary: () => request('GET', '/api/admin/summary'),
    investors: (q) => requestPage(`/api/admin/investors${qs(q)}`),
    investor: (id) => request('GET', `/api/admin/investors/${encodeURIComponent(id)}`),
    createInvestor: (input) => request('POST', '/api/admin/investors', input),
    investments: (q) => requestPage(`/api/admin/investments${qs(q)}`),
    statistics: (investorId) => request('GET', `/api/admin/statistics${qs({ investor_id: investorId })}`),
    investment: async (id) =>
      normalizeInvestmentDetail(await request('GET', `/api/admin/investments/${encodeURIComponent(id)}`)) as any,
    createInvestment: (input) => request('POST', '/api/admin/investments', input),
    // PROPUESTO
    yields: (investmentId, q) =>
      request('GET', `/api/admin/investments/${encodeURIComponent(investmentId)}/yields${qs({ pending: q?.pendingOnly ? 1 : undefined })}`),
    previewYield: (input) => request('POST', '/api/admin/yields/preview', input),
    confirmYield: (input) => request('POST', '/api/admin/yields/confirm', input),
    manualYield: (input) => request('POST', '/api/admin/yields/manual', input),
    reverseYield: (id, reason) => request('POST', `/api/admin/yields/${encodeURIComponent(id)}/reverse`, { reason }),
    // PROPUESTO
    payments: (q) => requestPage(`/api/admin/payments${qs(q)}`),
    recordPayment: (input) => request('POST', '/api/admin/payments', input),
    reinvest: (investmentId, input) =>
      request('POST', `/api/admin/investments/${encodeURIComponent(investmentId)}/reinvest`, input),
    // PROPUESTO
    documents: (q) => requestPage(`/api/admin/documents${qs(q)}`),
    uploadDocument: (input) => {
      const fd = new FormData();
      fd.set('file', input.file);
      fd.set('title', input.title);
      fd.set('document_type', input.document_type);
      return request('POST', `/api/admin/investments/${encodeURIComponent(input.investment_id)}/documents`, fd);
    },
    // PROPUESTO (documentos solo para administración)
    downloadDocument: (id) => requestBlob(`/api/admin/documents/${encodeURIComponent(id)}/download`),
    archiveDocument: async (id) => {
      await request('DELETE', `/api/admin/documents/${encodeURIComponent(id)}`);
    },
    // PROPUESTO
    notifications: (q) => requestPage(`/api/admin/notifications${qs(q)}`),
    auditLogs: (q) => requestPage(`/api/admin/audit-logs${qs(q)}`),
    referenceRates: (q) => requestPage(`/api/admin/reference-rates${qs(q)}`),
    createReferenceRate: (input) => request('POST', '/api/admin/reference-rates', input),
    deleteReferenceRate: async (id) => {
      await request('DELETE', `/api/admin/reference-rates/${encodeURIComponent(id)}`);
    },
    banxicoPreview: (range = {}) => request('GET', `/api/admin/reference-rates/banxico/preview${qs(range)}`),
    banxicoImport: (range) => request('POST', '/api/admin/reference-rates/banxico/import', range)
  }
};
