/**
 * Client-generated id for a new bill row. Matches server-side default (`bill_${uuid}`) and avoids
 * accidental PRIMARY KEY collisions with numeric/imported ids, which previously used `Date.now()`.
 */
export function newBillRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `bill_${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `bill_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
}
