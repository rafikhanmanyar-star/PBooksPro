import { AsyncLocalStorage } from 'node:async_hooks';

type TenantContextStore = {
  tenantId: string;
  userId?: string;
};

/**
 * Request-scoped tenant context.
 *
 * Why:
 * - PostgreSQL Row Level Security policies depend on `app.current_tenant_id`.
 * - With connection pooling, we must set that variable on the *same connection*
 *   that executes each query/transaction.
 * - Express routes currently call a shared DatabaseService which uses a Pool and
 *   doesn't receive `tenantId` as an argument.
 *
 * Solution:
 * - Store tenantId in AsyncLocalStorage for the lifetime of a request.
 * - DatabaseService reads it and applies `SET LOCAL app.current_tenant_id`.
 */
export const tenantContext = new AsyncLocalStorage<TenantContextStore>();

export function runWithTenantContext<T>(
  store: TenantContextStore,
  fn: () => T
): T {
  return tenantContext.run(store, fn);
}

export function getCurrentTenantId(): string | undefined {
  return tenantContext.getStore()?.tenantId;
}

