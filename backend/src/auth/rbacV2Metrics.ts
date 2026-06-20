/**
 * RBAC 2.0 Phase 3 — authorization observability (no sensitive data in logs).
 */
import type { AuthedRequest } from '../middleware/authMiddleware.js';
import { captureMonitoringEvent } from '../services/monitoring/monitoringCapture.js';

type RbacMetricCode =
  | 'RBAC_V2_PERMISSION_CHECK'
  | 'RBAC_V2_DENY'
  | 'RBAC_V2_STALE_AV'
  | 'RBAC_V2_BREAK_GLASS'
  | 'RBAC_V2_SCOPE_FILTER'
  | 'RBAC_V2_SCOPE_DENY'
  | 'RBAC_V2_SCOPE_ASSIGNMENT'
  | 'RBAC_V2_SCOPE_HASH_CHANGE'
  | 'RBAC_V2_APPROVAL_REQUIRED'
  | 'RBAC_V2_APPROVAL_GRANTED'
  | 'RBAC_V2_APPROVAL_REJECTED'
  | 'RBAC_V2_APPROVAL_ESCALATED'
  | 'RBAC_V2_APPROVAL_HASH_CHANGE';

function captureRbacMetric(
  code: RbacMetricCode,
  req: AuthedRequest | undefined,
  extra?: { permissionKey?: string; reason?: string }
): void {
  captureMonitoringEvent({
    category: 'authentication',
    severity: code === 'RBAC_V2_DENY' || code === 'RBAC_V2_STALE_AV' ? 'warn' : 'info',
    message: code,
    code,
    tenantId: req?.tenantId ?? null,
    userId: req?.userId ?? null,
    route: req?.originalUrl,
    method: req?.method,
    requestId: (req as { requestId?: string })?.requestId,
    metadata: {
      permissionKey: extra?.permissionKey,
      reason: extra?.reason,
      breakGlass: req?.sessionType === 'break_glass',
    },
  });
}

export function recordRbacPermissionCheck(req: AuthedRequest, permissionKey?: string): void {
  captureRbacMetric('RBAC_V2_PERMISSION_CHECK', req, { permissionKey });
}

export function recordRbacDeny(req: AuthedRequest, permissionKey: string): void {
  captureRbacMetric('RBAC_V2_DENY', req, { permissionKey, reason: 'insufficient_permission' });
}

export function recordRbacStaleAv(req: AuthedRequest): void {
  captureRbacMetric('RBAC_V2_STALE_AV', req, { reason: 'access_version_mismatch' });
}

export function recordRbacBreakGlass(req: AuthedRequest, reason: string): void {
  captureRbacMetric('RBAC_V2_BREAK_GLASS', req, { reason });
}

export function recordRbacScopeFilter(req: AuthedRequest, dimension: string): void {
  captureRbacMetric('RBAC_V2_SCOPE_FILTER', req, { reason: dimension });
}

export function recordRbacScopeDeny(req: AuthedRequest, dimension: string): void {
  captureRbacMetric('RBAC_V2_SCOPE_DENY', req, { reason: dimension });
}

export function recordRbacScopeAssignment(req: AuthedRequest, action: string): void {
  captureRbacMetric('RBAC_V2_SCOPE_ASSIGNMENT', req, { reason: action });
}

export function recordRbacScopeHashChange(req: AuthedRequest): void {
  captureRbacMetric('RBAC_V2_SCOPE_HASH_CHANGE', req, { reason: 'scope_mutation' });
}

export function recordRbacApprovalRequired(req: AuthedRequest, entityType: string): void {
  captureRbacMetric('RBAC_V2_APPROVAL_REQUIRED', req, { reason: entityType });
}

export function recordRbacApprovalGranted(req: AuthedRequest): void {
  captureRbacMetric('RBAC_V2_APPROVAL_GRANTED', req);
}

export function recordRbacApprovalRejected(req: AuthedRequest, reason: string): void {
  captureRbacMetric('RBAC_V2_APPROVAL_REJECTED', req, { reason });
}

export function recordRbacApprovalEscalated(req: AuthedRequest, level: number): void {
  captureRbacMetric('RBAC_V2_APPROVAL_ESCALATED', req, { reason: String(level) });
}

export function recordRbacApprovalHashChange(req: AuthedRequest): void {
  captureRbacMetric('RBAC_V2_APPROVAL_HASH_CHANGE', req, { reason: 'approval_mutation' });
}
