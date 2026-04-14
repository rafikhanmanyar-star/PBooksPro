/**
 * Central query keys for cache invalidation (ledger, invoices, reports).
 */

export const queryKeys = {
  ledger: {
    all: ['ledger'] as const,
    paginated: (projectId: string | null | undefined, pageSize: number) =>
      ['ledger', 'paginated', projectId ?? 'all', pageSize] as const,
    count: (projectId: string | null | undefined) => ['ledger', 'count', projectId ?? 'all'] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    apiList: (filtersKey: string) => ['invoices', 'api', filtersKey] as const,
  },
  reports: {
    all: ['reports'] as const,
    orgUsers: () => ['reports', 'orgUsers'] as const,
  },
  rental: {
    /** Warmed while on Visual Layout; read for instant counts / future API merge */
    invoicesList: () => ['rental', 'invoices', 'list'] as const,
  },
} as const;

