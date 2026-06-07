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
    return apiClient.get(`/reports/reconciliation/certification?${qs.toString()}`);
  },

  async getReportSources(): Promise<{ items: ReportSourceAudit[] }> {
    return apiClient.get('/reports/reconciliation/sources');
  },
};
