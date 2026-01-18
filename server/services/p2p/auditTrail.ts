/**
 * P2P Audit Trail Service
 * 
 * Records all status changes and actions in the P2P system
 * Provides timestamped history for audit purposes
 */

export type P2PAuditEntityType = 'PO' | 'INVOICE' | 'BILL';
export type P2PAuditAction = 'STATUS_CHANGE' | 'CREATED' | 'APPROVED' | 'REJECTED' | 'FLIPPED' | 'DELIVERED' | 'COMPLETED';

export interface P2PAuditTrailEntry {
  id: string;
  entityType: P2PAuditEntityType;
  entityId: string;
  action: P2PAuditAction;
  fromStatus?: string;
  toStatus?: string;
  performedBy?: string;
  performedAt: string;
  notes?: string;
  tenantId: string;
}

/**
 * Log a status change in the audit trail
 * This function is a stub - actual implementation should use database service
 */
export async function logStatusChange(
  entityType: P2PAuditEntityType,
  entityId: string,
  action: P2PAuditAction,
  fromStatus?: string,
  toStatus?: string,
  userId?: string,
  tenantId?: string,
  notes?: string
): Promise<void> {
  // TODO: Implement actual database logging
  // This should insert into p2p_audit_trail table
  const auditEntry: P2PAuditTrailEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    entityType,
    entityId,
    action,
    fromStatus,
    toStatus,
    performedBy: userId,
    performedAt: new Date().toISOString(),
    notes,
    tenantId: tenantId || ''
  };

  // Log to console for now (will be replaced with database call)
  console.log('📋 P2P Audit Trail:', auditEntry);
}

/**
 * Log entity creation
 */
export async function logEntityCreated(
  entityType: P2PAuditEntityType,
  entityId: string,
  userId?: string,
  tenantId?: string,
  notes?: string
): Promise<void> {
  await logStatusChange(entityType, entityId, 'CREATED', undefined, undefined, userId, tenantId, notes);
}

/**
 * Log invoice flip (PO to Invoice)
 */
export async function logInvoiceFlip(
  poId: string,
  invoiceId: string,
  userId?: string,
  tenantId?: string
): Promise<void> {
  await logStatusChange('INVOICE', invoiceId, 'FLIPPED', undefined, 'PENDING', userId, tenantId, `Flipped from PO: ${poId}`);
}
