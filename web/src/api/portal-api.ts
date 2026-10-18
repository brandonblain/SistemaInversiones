import type {
  AdminInvestmentRow,
  AdminInvestorDetail,
  AdminInvestorRow,
  AdminPaymentRow,
  AdminSummary,
  AdminYieldEntry,
  AuditLogRow,
  ConfirmYieldInput,
  CreateInvestmentInput,
  CreateInvestorInput,
  HistoryEntry,
  HistoryType,
  InvestmentDetail,
  InvestmentDocument,
  InvestmentListItem,
  InvestmentSeries,
  InvestmentStatus,
  InvestorSummary,
  LoginInput,
  ManualYieldInput,
  MfaSetup,
  NotificationEvent,
  PageQuery,
  Paginated,
  RecordPaymentInput,
  ReinvestInput,
  Session,
  UploadDocumentInput,
  YieldPreview,
  YieldPreviewInput
} from './types';

/** Superficie completa que consume la interfaz. Implementada por la API real (http) y por los mocks FICTICIOS. */
export interface PortalApi {
  auth: {
    login(input: LoginInput): Promise<Session>;
    logout(): Promise<void>;
    me(): Promise<Session>;
    changePassword(current_password: string, new_password: string): Promise<void>;
    requestPasswordReset(email: string): Promise<void>;
    resetPassword(token: string, new_password: string): Promise<void>;
    mfaSetup(): Promise<MfaSetup>;
    mfaVerify(token: string): Promise<void>;
  };
  investor: {
    summary(): Promise<InvestorSummary>;
    investments(q: PageQuery & { status?: InvestmentStatus | '' }): Promise<Paginated<InvestmentListItem>>;
    investment(id: string): Promise<InvestmentDetail>;
    history(id: string, q: PageQuery & { type?: HistoryType }): Promise<Paginated<HistoryEntry>>;
    series(id: string): Promise<InvestmentSeries>;
    notifications(q: PageQuery): Promise<Paginated<NotificationEvent>>;
  };
  admin: {
    summary(): Promise<AdminSummary>;
    investors(q: PageQuery & { q?: string; active?: '' | '1' | '0' }): Promise<Paginated<AdminInvestorRow>>;
    investor(id: string): Promise<AdminInvestorDetail>;
    createInvestor(input: CreateInvestorInput): Promise<{ user_id: string }>;
    investments(q: PageQuery & { q?: string; status?: InvestmentStatus | '' }): Promise<Paginated<AdminInvestmentRow>>;
    investment(id: string): Promise<InvestmentDetail & { investor_user_id: string; investor_name: string | null; notes: string | null }>;
    createInvestment(input: CreateInvestmentInput): Promise<{ investment_id: string }>;
    yields(investmentId: string, q?: { pendingOnly?: boolean }): Promise<AdminYieldEntry[]>;
    previewYield(input: YieldPreviewInput): Promise<YieldPreview>;
    confirmYield(input: ConfirmYieldInput): Promise<{ yield_entry_id: string; is_existing: boolean; amount_cents: number }>;
    manualYield(input: ManualYieldInput): Promise<{ yield_entry_id: string }>;
    reverseYield(yieldId: string, reason: string): Promise<{ reversal_entry_id: string }>;
    payments(q: PageQuery & { investment_id?: string }): Promise<Paginated<AdminPaymentRow>>;
    recordPayment(input: RecordPaymentInput): Promise<{ payment_id: string }>;
    reinvest(investmentId: string, input: ReinvestInput): Promise<unknown>;
    documents(q: PageQuery & { investment_id?: string }): Promise<Paginated<InvestmentDocument>>;
    uploadDocument(input: UploadDocumentInput): Promise<{ id: string }>;
    downloadDocument(id: string): Promise<{ blob: Blob; filename: string | null }>;
    archiveDocument(id: string): Promise<void>;
    notifications(q: PageQuery & { status?: string }): Promise<Paginated<NotificationEvent>>;
    auditLogs(q: PageQuery & { action?: string }): Promise<Paginated<AuditLogRow>>;
  };
}
