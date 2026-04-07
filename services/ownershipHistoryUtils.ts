/**
 * Ownership history utilities for resolving owner at a given date (rent attribution).
 */

import type { PropertyOwnershipHistory } from '../types';

/**
 * Returns the owner ID for a property on a given date using ownership history.
 * Uses the row where ownership_start_date <= date and (ownership_end_date IS NULL or ownership_end_date >= date).
 * Falls back to propertyOwnerId (e.g. property.ownerId) when no history row exists for that date.
 */
export function getOwnerIdForPropertyOnDate(
  propertyId: string,
  date: string,
  ownershipHistory: PropertyOwnershipHistory[],
  propertyOwnerId?: string
): string | undefined {
  const rows = ownershipHistory.filter(
    (h) =>
      h.propertyId === propertyId &&
      h.ownershipStartDate <= date &&
      (h.ownershipEndDate == null || h.ownershipEndDate >= date)
  );
  // Prefer most recent start date if multiple (e.g. overlapping backdated transfers)
  if (rows.length > 0) {
    const sorted = [...rows].sort((a, b) => b.ownershipStartDate.localeCompare(a.ownershipStartDate));
    return sorted[0].ownerId;
  }
  return propertyOwnerId ?? undefined;
}
