import { apiClient } from './client';

export type CertificationStatus = 'reconciled' | 'differences' | 'critical';

export type ReconciliationCheck = {
  id: string;
  label: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  difference?: number;
  severity: 'info' | 'warning' | 'error';
};

export type MissingJournalMirror = {
  transactionId: string;
  date: string;
  type: string;
  amount: number;
  description?: string;
  accountId?: string;
};

export type ReportSourceAudit = {
  reportId: string;
  reportName: string;
  primarySource: 'journal' | 'transactions' | 'subledger' | 'hybrid';
  status: 'unified' | 'partial' | 'legacy';
  notes: string;
};

export type FinancialReconciliationCertification = {
  certifiedAt: string;
  period: { from: string; to: string; asOfDate: string };
  overallStatus: CertificationStatus;
  score: number;
  checks: ReconciliationCheck[];
  reportSources: ReportSourceAudit[];
  missingJournals: MissingJournalMirror[];
  missingJournalCount: number;
  missingJournalTotalAmount: number;
  transactionCount: number;
  journalEntryCount: number;
  differences: Array<{ code: string; message: string; severity: string; amount?: number }>;
  summary: string;
  reconciliation: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    netProfit: number;
    equityChangeFromPl: number;
    isBalanced: boolean;
    assetsEqualLiabilitiesPlusEquity: boolean;
    issues: string[];
  };
};

function normalizeCertification(raw: Record<string, unknown>): FinancialReconciliationCertification {
  const periodRaw = raw.period && typeof raw.period === 'object' ? (raw.period as Record<string, unknown>) : {};
  const reconRaw =
    raw.reconciliation && typeof raw.reconciliation === 'object'
      ? (raw.reconciliation as Record<string, unknown>)
      : {};
  return {
    certifiedAt: String(raw.certifiedAt ?? new Date().toISOString()),
    period: {
      from: String(periodRaw.from ?? ''),
      to: String(periodRaw.to ?? ''),
      asOfDate: String(periodRaw.asOfDate ?? periodRaw.to ?? ''),
    },
    overallStatus: (raw.overallStatus as CertificationStatus) ?? 'critical',
    score: Number(raw.score ?? 0),
    checks: Array.isArray(raw.checks) ? (raw.checks as FinancialReconciliationCertification['checks']) : [],
    reportSources: Array.isArray(raw.reportSources)
      ? (raw.reportSources as FinancialReconciliationCertification['reportSources'])
      : [],
    missingJournals: Array.isArray(raw.missingJournals)
      ? (raw.missingJournals as FinancialReconciliationCertification['missingJournals'])
      : [],
    missingJournalCount: Number(raw.missingJournalCount ?? 0),
    missingJournalTotalAmount: Number(raw.missingJournalTotalAmount ?? 0),
    transactionCount: Number(raw.transactionCount ?? 0),
    journalEntryCount: Number(raw.journalEntryCount ?? 0),
    differences: Array.isArray(raw.differences)
      ? (raw.differences as FinancialReconciliationCertification['differences'])
      : [],
    summary: String(raw.summary ?? ''),
    reconciliation: {
      totalAssets: Number(reconRaw.totalAssets ?? 0),
      totalLiabilities: Number(reconRaw.totalLiabilities ?? 0),
      totalEquity: Number(reconRaw.totalEquity ?? 0),
      netProfit: Number(reconRaw.netProfit ?? 0),
      equityChangeFromPl: Number(reconRaw.equityChangeFromPl ?? 0),
      isBalanced: Boolean(reconRaw.isBalanced),
      assetsEqualLiabilitiesPlusEquity: Boolean(reconRaw.assetsEqualLiabilitiesPlusEquity),
      issues: Array.isArray(reconRaw.issues) ? reconRaw.issues.map(String) : [],
    },
  };
}

export const financialReconciliationApi = {
  async getCertification(options: {
    from: string;
    to: string;
    projectId?: string;
  }): Promise<FinancialReconciliationCertification> {
    const qs = new URLSearchParams({ from: options.from, to: options.to });
    if (options.projectId && options.projectId !== 'all') {
      qs.set('projectId', options.projectId);
    }
    const raw = await apiClient.get<Record<string, unknown>>(
      `/reports/reconciliation/certification?${qs.toString()}`
    );
    return normalizeCertification(raw);
  },

  async getReportSources(): Promise<{ items: ReportSourceAudit[] }> {
    return apiClient.get('/reports/reconciliation/sources');
  },
};
