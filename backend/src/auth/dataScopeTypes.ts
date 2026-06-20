/**
 * AUTO-GENERATED — do not edit. Source: shared/rbac/dataScopeTypes.ts
 * Regenerate: node scripts/ensure-shared-financial-cores.mjs
 */

/**
 * RBAC 2.0 Phase 4 — data scope dimensions (Option A: no company dimension).
 */
export const SCOPE_DIMENSIONS = ['project', 'property', 'owner', 'department'] as const;

export type ScopeDimension = (typeof SCOPE_DIMENSIONS)[number];

export type DataScopeMode = 'all' | 'assigned';

/** Effective scope grant attached to EffectiveAccessContext. */
export type DataScopeGrant = {
  dimension: ScopeDimension;
  mode: DataScopeMode;
  entityIds?: readonly string[];
};

export function isScopeDimension(value: string): value is ScopeDimension {
  return (SCOPE_DIMENSIONS as readonly string[]).includes(value);
}
