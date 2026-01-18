/**
 * P2P State Machine Service
 * 
 * Manages valid state transitions for Purchase Orders and Invoices
 * Enforces business rules for document lifecycle
 */

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

type POStatusKey = keyof typeof VALID_TRANSITIONS.PO;
type InvoiceStatusKey = keyof typeof VALID_TRANSITIONS.INVOICE;

/**
 * Check if a PO status transition is valid
 */
export function canTransitionPO(from: string, to: string): boolean {
  if (!(from in VALID_TRANSITIONS.PO)) {
    return false;
  }
  const validNextStates = VALID_TRANSITIONS.PO[from as POStatusKey];
  return validNextStates ? validNextStates.includes(to as any) : false;
}

/**
 * Check if an Invoice status transition is valid
 */
export function canTransitionInvoice(from: string, to: string): boolean {
  if (!(from in VALID_TRANSITIONS.INVOICE)) {
    return false;
  }
  const validNextStates = VALID_TRANSITIONS.INVOICE[from as InvoiceStatusKey];
  return validNextStates ? validNextStates.includes(to as any) : false;
}

/**
 * Get valid next states for a PO status
 */
export function getValidPOTransitions(currentStatus: string): string[] {
  if (!(currentStatus in VALID_TRANSITIONS.PO)) {
    return [];
  }
  return [...(VALID_TRANSITIONS.PO[currentStatus as POStatusKey] || [])];
}

/**
 * Get valid next states for an Invoice status
 */
export function getValidInvoiceTransitions(currentStatus: string): string[] {
  if (!(currentStatus in VALID_TRANSITIONS.INVOICE)) {
    return [];
  }
  return [...(VALID_TRANSITIONS.INVOICE[currentStatus as InvoiceStatusKey] || [])];
}

/**
 * Validate PO status transition and throw if invalid
 */
export function validatePOTransition(from: string, to: string): void {
  if (!canTransitionPO(from, to)) {
    throw new Error(`Invalid PO status transition: ${from} -> ${to}`);
  }
}

/**
 * Validate Invoice status transition and throw if invalid
 */
export function validateInvoiceTransition(from: string, to: string): void {
  if (!canTransitionInvoice(from, to)) {
    throw new Error(`Invalid Invoice status transition: ${from} -> ${to}`);
  }
}
