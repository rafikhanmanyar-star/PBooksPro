/**
 * RBAC 2.0 feature flag — Phase 2 runs in parallel until explicitly enabled.
 */
export function isRbacV2RoleManagementEnabled(): boolean {
  return process.env.RBAC_V2_ROLE_MANAGEMENT === 'true';
}

/** C2 — SYSTEM_OWNER break-glass sessions (requires role management flag). */
export function isRbacV2BreakGlassEnabled(): boolean {
  return (
    isRbacV2RoleManagementEnabled() && process.env.RBAC_V2_BREAK_GLASS === 'true'
  );
}
