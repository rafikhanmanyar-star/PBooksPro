import { getWebSocketService } from './websocketService.js';

// Events from external sources (webhooks) that must always be delivered,
// even when only one user is connected.
const ALWAYS_EMIT_PREFIXES = ['whatsapp:'];

/**
 * Helper function to emit WebSocket events from API routes.
 * Skips entity-sync broadcasts when only one unique user is connected
 * to the tenant (no one else to sync with), improving performance.
 * External events (e.g. WhatsApp) are always emitted.
 */
export function emitToTenant(tenantId: string, event: string, data: any): void {
  try {
    const wsService = getWebSocketService();

    const alwaysEmit = ALWAYS_EMIT_PREFIXES.some(prefix => event.startsWith(prefix));
    if (!alwaysEmit && wsService.getUniqueUserCount(tenantId) <= 1) {
      return;
    }

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

  // Vendors
  VENDOR_CREATED: 'vendor:created',
  VENDOR_UPDATED: 'vendor:updated',
  VENDOR_DELETED: 'vendor:deleted',

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

  // Sales Returns
  SALES_RETURN_CREATED: 'sales_return:created',
  SALES_RETURN_UPDATED: 'sales_return:updated',
  SALES_RETURN_DELETED: 'sales_return:deleted',

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

  // Quotations
  QUOTATION_CREATED: 'quotation:created',
  QUOTATION_UPDATED: 'quotation:updated',
  QUOTATION_DELETED: 'quotation:deleted',

  // Documents
  DOCUMENT_CREATED: 'document:created',
  DOCUMENT_UPDATED: 'document:updated',
  DOCUMENT_DELETED: 'document:deleted',

  // Recurring Invoice Templates
  RECURRING_INVOICE_TEMPLATE_CREATED: 'recurring_invoice_template:created',
  RECURRING_INVOICE_TEMPLATE_UPDATED: 'recurring_invoice_template:updated',
  RECURRING_INVOICE_TEMPLATE_DELETED: 'recurring_invoice_template:deleted',

  // App Settings
  APP_SETTING_UPDATED: 'app_setting:updated',

  // License Settings
  LICENSE_SETTING_UPDATED: 'license_setting:updated',

  // PM Cycle Allocations
  PM_CYCLE_ALLOCATION_CREATED: 'pm_cycle_allocation:created',
  PM_CYCLE_ALLOCATION_UPDATED: 'pm_cycle_allocation:updated',
  PM_CYCLE_ALLOCATION_DELETED: 'pm_cycle_allocation:deleted',

  // WhatsApp Messages
  WHATSAPP_MESSAGE_RECEIVED: 'whatsapp:message:received',
  WHATSAPP_MESSAGE_SENT: 'whatsapp:message:sent',
  WHATSAPP_MESSAGE_STATUS: 'whatsapp:message:status',



  DATA_UPDATED: 'data:updated', // Generic event for any data update
  BULK_IMPORT_COMPLETED: 'bulk_import:completed', // Emitted after a successful bulk import so other clients refresh

  // Plan Amenities
  PLAN_AMENITY_CREATED: 'plan_amenity:created',
  PLAN_AMENITY_UPDATED: 'plan_amenity:updated',
  PLAN_AMENITY_DELETED: 'plan_amenity:deleted',

  // Installment Plans
  INSTALLMENT_PLAN_CREATED: 'installment_plan:created',
  INSTALLMENT_PLAN_UPDATED: 'installment_plan:updated',
  INSTALLMENT_PLAN_DELETED: 'installment_plan:deleted',

  // Purchase Bills (My Shop)
  PURCHASE_BILL_CREATED: 'purchase_bill:created',
  PURCHASE_BILL_UPDATED: 'purchase_bill:updated',
  PURCHASE_BILL_DELETED: 'purchase_bill:deleted',
  PURCHASE_BILL_ITEM_UPDATED: 'purchase_bill_item:updated',
  PURCHASE_BILL_ITEM_DELETED: 'purchase_bill_item:deleted',
  PURCHASE_BILL_PAYMENT_CREATED: 'purchase_bill_payment:created',
  INVENTORY_STOCK_UPDATED: 'inventory_stock:updated',
} as const;


