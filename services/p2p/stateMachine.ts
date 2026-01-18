/**
 * P2P State Machine Service
 * 
 * Manages valid state transitions for Purchase Orders and Invoices
 * Enforces business rules for document lifecycle
 */

import { POStatus, P2PInvoiceStatus } from '../../types';

// Valid state transitions
const VALID_TRANSITIONS = {
  PO: {
    DRAFT: ['SENT'],
    SENT: ['RECEIVED', 'INVOICED'],
    RECEIVED: ['INVOICED'],
    INVOICED: ['DELIVERED'],
    DELIVERED: ['COMPLETED'],
    COMPLETED: [] // Terminal state
  },
  INVOICE: {
    PENDING: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
    UNDER_REVIEW: ['APPROVED', 'REJECTED'],
    APPROVED: [], // Terminal state
    REJECTED: [] // Terminal state
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
export function getValidPOTransitions(currentStatus: POStatus): POStatus[] {
  return (VALID_TRANSITIONS.PO[currentStatus] || []) as POStatus[];
}

/**
 * Get valid next states for an Invoice status
 */
export function getValidInvoiceTransitions(currentStatus: P2PInvoiceStatus): P2PInvoiceStatus[] {
  return (VALID_TRANSITIONS.INVOICE[currentStatus] || []) as P2PInvoiceStatus[];
}

/**
 * Validate PO status transition and throw if invalid
 */
export function validatePOTransition(from: POStatus, to: POStatus): void {
  if (!canTransitionPO(from, to)) {
    throw new Error(`Invalid PO status transition: ${from} -> ${to}`);
  }
}

/**
 * Validate Invoice status transition and throw if invalid
 */
export function validateInvoiceTransition(from: P2PInvoiceStatus, to: P2PInvoiceStatus): void {
  if (!canTransitionInvoice(from, to)) {
    throw new Error(`Invalid Invoice status transition: ${from} -> ${to}`);
  }
}
