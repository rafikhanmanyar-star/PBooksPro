/**
 * Domain module layout (Architecture v2):
 *
 * backend/src/modules/{domain}/
 *   routes/       — HTTP handlers (validation, auth, delegate to services)
 *   services/     — business logic, transactions, state machines
 *   repositories/ — DB access via TenantRepository
 *   validators/   — Zod schemas
 *   types/        — domain types
 *
 * Modules: accounting, crm, customers, vendors, properties, project-selling,
 * leases, reporting, dashboard, documents, notifications, admin
 */

export const DOMAIN_MODULES = [
  'accounting',
  'crm',
  'customers',
  'vendors',
  'properties',
  'project-selling',
  'leases',
  'reporting',
  'dashboard',
  'documents',
  'notifications',
  'admin',
] as const;

export type DomainModule = (typeof DOMAIN_MODULES)[number];
