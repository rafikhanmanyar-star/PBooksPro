import { getWebSocketService } from './websocketService.js';

/**
 * Helper function to emit WebSocket events from API routes
 * Ensures WebSocket service is available before emitting
 */
export function emitToTenant(tenantId: string, event: string, data: any): void {
  try {
    const wsService = getWebSocketService();
    wsService.emitToTenant(tenantId, event, data);
  } catch (error) {
    // Silently fail if WebSocket is not initialized (e.g., during testing)
    console.warn('WebSocket emit failed (non-critical):', error);
  }
}

/**
 * Event names for real-time synchronization
 */
export const WS_EVENTS = {
  // Transactions
  TRANSACTION_CREATED: 'transaction:created',
  TRANSACTION_UPDATED: 'transaction:updated',
  TRANSACTION_DELETED: 'transaction:deleted',
  
  // Invoices
  INVOICE_CREATED: 'invoice:created',
  INVOICE_UPDATED: 'invoice:updated',
  INVOICE_DELETED: 'invoice:deleted',
  
  // Bills
  BILL_CREATED: 'bill:created',
  BILL_UPDATED: 'bill:updated',
  BILL_DELETED: 'bill:deleted',
  
  // Contacts
  CONTACT_CREATED: 'contact:created',
  CONTACT_UPDATED: 'contact:updated',
  CONTACT_DELETED: 'contact:deleted',
  
  // Projects
  PROJECT_CREATED: 'project:created',
  PROJECT_UPDATED: 'project:updated',
  PROJECT_DELETED: 'project:deleted',
  
  // Accounts
  ACCOUNT_CREATED: 'account:created',
  ACCOUNT_UPDATED: 'account:updated',
  ACCOUNT_DELETED: 'account:deleted',
  
  // Categories
  CATEGORY_CREATED: 'category:created',
  CATEGORY_UPDATED: 'category:updated',
  CATEGORY_DELETED: 'category:deleted',
  
  // Budgets
  BUDGET_CREATED: 'budget:created',
  BUDGET_UPDATED: 'budget:updated',
  BUDGET_DELETED: 'budget:deleted',
  
  // Rental Agreements
  RENTAL_AGREEMENT_CREATED: 'rental_agreement:created',
  RENTAL_AGREEMENT_UPDATED: 'rental_agreement:updated',
  RENTAL_AGREEMENT_DELETED: 'rental_agreement:deleted',
  
  // Project Agreements
  PROJECT_AGREEMENT_CREATED: 'project_agreement:created',
  PROJECT_AGREEMENT_UPDATED: 'project_agreement:updated',
  PROJECT_AGREEMENT_DELETED: 'project_agreement:deleted',
  
  // Contracts
  CONTRACT_CREATED: 'contract:created',
  CONTRACT_UPDATED: 'contract:updated',
  CONTRACT_DELETED: 'contract:deleted',
  
  // Buildings
  BUILDING_CREATED: 'building:created',
  BUILDING_UPDATED: 'building:updated',
  BUILDING_DELETED: 'building:deleted',
  
  // Properties
  PROPERTY_CREATED: 'property:created',
  PROPERTY_UPDATED: 'property:updated',
  PROPERTY_DELETED: 'property:deleted',
  
  // Units
  UNIT_CREATED: 'unit:created',
  UNIT_UPDATED: 'unit:updated',
  UNIT_DELETED: 'unit:deleted',
  
  // Users
  USER_CREATED: 'user:created',
  USER_UPDATED: 'user:updated',
  USER_DELETED: 'user:deleted',
  
  // Connection events
  USER_CONNECTED: 'user:connected',
  USER_DISCONNECTED: 'user:disconnected',
  
  // Chat events
  CHAT_MESSAGE: 'chat:message',
} as const;

