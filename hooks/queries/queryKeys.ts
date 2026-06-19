/**
 * Central query keys for cache invalidation (ledger, invoices, reports).
 *
 * Canonical keys — do not duplicate these endpoints under alternate keys:
 * - GET /users          → queryKeys.orgUsers()  ['orgUsers']
 * - GET /invoices (list) → queryKeys.invoices.all (AppState warm cache uses rental.invoicesList)
 *
 * @see docs/performance/A2.5_IMPLEMENTATION_SPEC.md (PERF-A2.5.3)
 */

const orgUsersKey = () => ['orgUsers'] as const;

export const queryKeys = {
  /** Organization users (GET /users) — shared by reports, share panel, lookups */
  orgUsers: orgUsersKey,
  ledger: {
    all: ['ledger'] as const,
    paginated: (projectId: string | null | undefined, pageSize: number) =>
      ['ledger', 'paginated', projectId ?? 'all', pageSize] as const,
    count: (projectId: string | null | undefined) => ['ledger', 'count', projectId ?? 'all'] as const,
  },
  invoices: {
    all: ['invoices'] as const,
  },
  reports: {
    all: ['reports'] as const,
    /** @deprecated Use queryKeys.orgUsers() — aliased for one release (PERF-A2.5.3). */
    orgUsers: orgUsersKey,
  },
  rental: {
    /** Warmed while on Visual Layout; read for instant counts / future API merge */
    invoicesList: () => ['rental', 'invoices', 'list'] as const,
  },
  contacts: {
    /** Dedicated infinite-list key — does not participate in global invalidation maps. */
    infinite: (filters: unknown, syncFingerprint: unknown) =>
      ['contacts', 'infinite', filters, syncFingerprint] as const,
  },
  projects: {
    all: ['projects'] as const,
  },
} as const;
