import type { Invoice } from '../types';

/**
 * False when the invoice was soft-deleted on the server (PostgreSQL deleted_at / API deletedAt).
 * Incremental sync removes tombstones from state; full refresh must not resurrect stale rows.
 */
export function isActiveInvoice(inv: Invoice): boolean {
    const d = inv.deletedAt;
    return d == null || d === '';
}
