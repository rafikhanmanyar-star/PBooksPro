/**
 * RBAC 2.0 Phase 3 — Authorization Engine feature flag.
 * Default false: legacy authorization path unchanged.
 */
export function isRbacV2AuthorizationEngineEnabled(): boolean {
  return process.env.RBAC_V2_AUTHORIZATION_ENGINE === 'true';
}
