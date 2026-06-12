export type ConstructionReportTab =
  | 'ledger'
  | 'payable'
  | 'overdue'
  | 'schedule'
  | 'payment-performance';

export interface ConstructionReportingFilters {
  from: string;
  to: string;
  projectId?: string;
  vendorId?: string;
  contractId?: string;
  status?: string;
}

export interface ReportingKpi {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'count';
}

export interface AgingBucket {
  bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  label: string;
  amount: number;
  entityCount: number;
}

export interface ConstructionReportingSummary {
  filters: ConstructionReportingFilters;
  generatedAt: string;
  kpis: ReportingKpi[];
  aging: AgingBucket[];
}

export interface PaginatedReportRows<T> {
  rows: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface Vendor360Detail {
  profile: {
    vendorId: string;
    name: string;
    contactNo?: string;
    companyName?: string;
    address?: string;
    description?: string;
  };
  contracts: {
    contractId: string;
    contractName: string;
    projectName: string;
    contractNo: string;
    status: string;
    totalAmount: number;
  }[];
  financial: {
    contractValue: number;
    billed: number;
    paid: number;
    outstanding: number;
    overdueAmount: number;
  };
  payments: { id: string; date: string; amount: number; description: string; billNumber?: string }[];
  notes: string[];
  documents: { id: string; name: string; type: string; fileName: string; createdAt?: string }[];
}
