/**
 * Legacy shim: historic segment/history lookups were removed. Use {@link resolveOwnerForPropertyOnDate}.
 */

/**
 * Returns the canonical ownerId for attribution when optional history existed; now delegates to propertyOwnerId only.
 */
export function getOwnerIdForPropertyOnDate(
  _propertyId: string,
  _date: string,
  _ownershipHistory: unknown[],
  propertyOwnerId?: string
): string | undefined {
  return propertyOwnerId ?? undefined;
}
