/**
 * P2P State Machine Service
 * 
 * Manages valid state transitions for Purchase Orders and Invoices
 * Enforces business rules for document lifecycle
 */

// Define enums inline to avoid import issues
type POStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'INVOICED' | 'DELIVERED' | 'COMPLETED';
type P2PInvoiceStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

// Valid state transitions
const VALID_TRANSITIONS = {
  PO: {
    DRAFT: ['SENT'] as const,
    SENT: ['RECEIVED', 'INVOICED'] as const,
    RECEIVED: ['INVOICED'] as const,
    INVOICED: ['DELIVERED'] as const,
    DELIVERED: ['COMPLETED'] as const,
    COMPLETED: [] as const
  },
  INVOICE: {
    PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const,
    UNDER_REVIEW: ['APPROVED', 'REJECTED'] as const,
    APPROVED: [] as const,
    REJECTED: [] as const
  }
} as const;

/**
 * Check if a PO status transition is valid
 */
export function canTransitionPO(from: POStatus, to: POStatus): boolean {
  const validNextStates = VALID_TRANSITIONS.PO[from];
  return validNextStates ? validNextStates.includes(to) : false;
}

/**
 * Check if an Invoice status transition is valid
 */
export function canTransitionInvoice(from: P2PInvoiceStatus, to: P2PInvoiceStatus): boolean {
  const validNextStates = VALID_TRANSITIONS.INVOICE[from];
  return validNextStates ? validNextStates.includes(to) : false;
}

/**
 * Get valid next states for a PO status
 */
export function getValidPOTransitions(currentStatus: POStatus): string[] {
  return [...(VALID_TRANSITIONS.PO[currentStatus] || [])];
}

/**
 * Get valid next states for an Invoice status
 */
export function getValidInvoiceTransitions(currentStatus: P2PInvoiceStatus): string[] {
  return [...(VALID_TRANSITIONS.INVOICE[currentStatus] || [])];
}

/**
 * Validate PO status transition and throw if invalid
 */
export function validatePOTransition(from: string, to: string): void {
  if (!canTransitionPO(from as POStatus, to as POStatus)) {
    throw new Error(`Invalid PO status transition: ${from} -> ${to}`);
  }
}

/**
 * Validate Invoice status transition and throw if invalid
 */
export function validateInvoiceTransition(from: string, to: string): void {
  if (!canTransitionInvoice(from as P2PInvoiceStatus, to as P2PInvoiceStatus)) {
    throw new Error(`Invalid Invoice status transition: ${from} -> ${to}`);
  }
}
