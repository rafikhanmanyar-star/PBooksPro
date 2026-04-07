/**
 * Field names for calendar dates (no time-of-day) — must never use UTC midnight via toISOString().
 * Used by SQLite column mapper and API JSON serialization.
 */
export const DATE_ONLY_CAMEL_FIELDS = new Set<string>([
  'issueDate',
  'dueDate',
  'startDate',
  'endDate',
  'date',
  'nextDueDate',
  'returnDate',
  'processedDate',
  'refundedDate',
  'receivedDate',
  'soldDate',
  'allocationDate',
  'joiningDate',
  'terminationDate',
  'entryDate',
  'ownershipStartDate',
  'ownershipEndDate',
  'transactionDate',
  'targetDeliveryDate',
  'cancellationDate',
]);

/** snake_case keys (API / mixed payloads) */
export const DATE_ONLY_SNAKE_FIELDS = new Set<string>([
  'issue_date',
  'due_date',
  'start_date',
  'end_date',
  'next_due_date',
  'return_date',
  'processed_date',
  'refunded_date',
  'received_date',
  'sold_date',
  'allocation_date',
  'joining_date',
  'termination_date',
  'entry_date',
  'ownership_start_date',
  'ownership_end_date',
  'transaction_date',
  'target_delivery_date',
  'cancellation_date',
]);

export function isDateOnlyFieldName(key: string): boolean {
  return DATE_ONLY_CAMEL_FIELDS.has(key) || DATE_ONLY_SNAKE_FIELDS.has(key);
}
