/**
 * Real-Time Sync Handler
 * 
 * Handles real-time updates from WebSocket and updates both:
 * 1. React state (AppContext) - for UI updates
 * 2. Local SQLite database (desktop only) - for offline support
 * 
 * Listens for entity create/update/delete events from server and syncs them.
 */

import { getDatabaseService } from '../database/databaseService';
import { getWebSocketClient } from '../websocketClient';
import { getLockManager } from './lockManager';
import { isMobileDevice } from '../../utils/platformDetection';
import { AppAction } from '../../types';

// Event name mapping: server event -> { entity, action }
const EVENT_MAP: Record<string, { entity: string; action: 'create' | 'update' | 'delete' }> = {
  'transaction:created': { entity: 'transaction', action: 'create' },
  'transaction:updated': { entity: 'transaction', action: 'update' },
  'transaction:deleted': { entity: 'transaction', action: 'delete' },
  'contact:created': { entity: 'contact', action: 'create' },
  'contact:updated': { entity: 'contact', action: 'update' },
  'contact:deleted': { entity: 'contact', action: 'delete' },
  'account:created': { entity: 'account', action: 'create' },
  'account:updated': { entity: 'account', action: 'update' },
  'account:deleted': { entity: 'account', action: 'delete' },
  'category:created': { entity: 'category', action: 'create' },
  'category:updated': { entity: 'category', action: 'update' },
  'category:deleted': { entity: 'category', action: 'delete' },
  'project:created': { entity: 'project', action: 'create' },
  'project:updated': { entity: 'project', action: 'update' },
  'project:deleted': { entity: 'project', action: 'delete' },
  'invoice:created': { entity: 'invoice', action: 'create' },
  'invoice:updated': { entity: 'invoice', action: 'update' },
  'invoice:deleted': { entity: 'invoice', action: 'delete' },
  'bill:created': { entity: 'bill', action: 'create' },
  'bill:updated': { entity: 'bill', action: 'update' },
  'bill:deleted': { entity: 'bill', action: 'delete' },
  'building:created': { entity: 'building', action: 'create' },
  'building:updated': { entity: 'building', action: 'update' },
  'building:deleted': { entity: 'building', action: 'delete' },
  'property:created': { entity: 'property', action: 'create' },
  'property:updated': { entity: 'property', action: 'update' },
  'property:deleted': { entity: 'property', action: 'delete' },
  'unit:created': { entity: 'unit', action: 'create' },
  'unit:updated': { entity: 'unit', action: 'update' },
  'unit:deleted': { entity: 'unit', action: 'delete' },
  'rental_agreement:created': { entity: 'rental_agreement', action: 'create' },
  'rental_agreement:updated': { entity: 'rental_agreement', action: 'update' },
  'rental_agreement:deleted': { entity: 'rental_agreement', action: 'delete' },
  'project_agreement:created': { entity: 'project_agreement', action: 'create' },
  'project_agreement:updated': { entity: 'project_agreement', action: 'update' },
  'project_agreement:deleted': { entity: 'project_agreement', action: 'delete' },
  'contract:created': { entity: 'contract', action: 'create' },
  'contract:updated': { entity: 'contract', action: 'update' },
  'contract:deleted': { entity: 'contract', action: 'delete' },
  'budget:created': { entity: 'budget', action: 'create' },
  'budget:updated': { entity: 'budget', action: 'update' },
  'budget:deleted': { entity: 'budget', action: 'delete' },
  'plan_amenity:created': { entity: 'plan_amenity', action: 'create' },
  'plan_amenity:updated': { entity: 'plan_amenity', action: 'update' },
  'plan_amenity:deleted': { entity: 'plan_amenity', action: 'delete' },
  'installment_plan:created': { entity: 'installment_plan', action: 'create' },
  'installment_plan:updated': { entity: 'installment_plan', action: 'update' },
  'installment_plan:deleted': { entity: 'installment_plan', action: 'delete' },
};

// Action type mapping: entity + action -> AppAction type
const ACTION_TYPE_MAP: Record<string, AppAction['type']> = {
  'transaction:create': 'ADD_TRANSACTION',
  'transaction:update': 'UPDATE_TRANSACTION',
  'transaction:delete': 'DELETE_TRANSACTION',
  'contact:create': 'ADD_CONTACT',
  'contact:update': 'UPDATE_CONTACT',
  'contact:delete': 'DELETE_CONTACT',
  'account:create': 'ADD_ACCOUNT',
  'account:update': 'UPDATE_ACCOUNT',
  'account:delete': 'DELETE_ACCOUNT',
  'category:create': 'ADD_CATEGORY',
  'category:update': 'UPDATE_CATEGORY',
  'category:delete': 'DELETE_CATEGORY',
  'project:create': 'ADD_PROJECT',
  'project:update': 'UPDATE_PROJECT',
  'project:delete': 'DELETE_PROJECT',
  'invoice:create': 'ADD_INVOICE',
  'invoice:update': 'UPDATE_INVOICE',
  'invoice:delete': 'DELETE_INVOICE',
  'bill:create': 'ADD_BILL',
  'bill:update': 'UPDATE_BILL',
  'bill:delete': 'DELETE_BILL',
  'building:create': 'ADD_BUILDING',
  'building:update': 'UPDATE_BUILDING',
  'building:delete': 'DELETE_BUILDING',
  'property:create': 'ADD_PROPERTY',
  'property:update': 'UPDATE_PROPERTY',
  'property:delete': 'DELETE_PROPERTY',
  'unit:create': 'ADD_UNIT',
  'unit:update': 'UPDATE_UNIT',
  'unit:delete': 'DELETE_UNIT',
  'rental_agreement:create': 'ADD_RENTAL_AGREEMENT',
  'rental_agreement:update': 'UPDATE_RENTAL_AGREEMENT',
  'rental_agreement:delete': 'DELETE_RENTAL_AGREEMENT',
  'project_agreement:create': 'ADD_PROJECT_AGREEMENT',
  'project_agreement:update': 'UPDATE_PROJECT_AGREEMENT',
  'project_agreement:delete': 'DELETE_PROJECT_AGREEMENT',
  'contract:create': 'ADD_CONTRACT',
  'contract:update': 'UPDATE_CONTRACT',
  'contract:delete': 'DELETE_CONTRACT',
  'budget:create': 'ADD_BUDGET',
  'budget:update': 'UPDATE_BUDGET',
  'budget:delete': 'DELETE_BUDGET',
  'plan_amenity:create': 'ADD_PLAN_AMENITY',
  'plan_amenity:update': 'UPDATE_PLAN_AMENITY',
  'plan_amenity:delete': 'DELETE_PLAN_AMENITY',
  'installment_plan:create': 'ADD_INSTALLMENT_PLAN',
  'installment_plan:update': 'UPDATE_INSTALLMENT_PLAN',
  'installment_plan:delete': 'DELETE_INSTALLMENT_PLAN',
};

// ============================================================================
// NORMALIZATION FUNCTIONS
// Convert snake_case fields from PostgreSQL to camelCase for client state
// ============================================================================

/**
 * Normalize unit data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeUnit(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    projectId: data.project_id ?? data.projectId ?? '',
    contactId: data.contact_id ?? data.contactId ?? undefined,
    salePrice: (() => {
      const price = data.sale_price ?? data.salePrice;
      if (price == null) return undefined;
      return typeof price === 'number' ? price : parseFloat(String(price));
    })(),
    description: data.description ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize property data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeProperty(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    ownerId: data.owner_id ?? data.ownerId ?? '',
    buildingId: data.building_id ?? data.buildingId ?? '',
    description: data.description ?? undefined,
    monthlyServiceCharge: (() => {
      const charge = data.monthly_service_charge ?? data.monthlyServiceCharge;
      if (charge == null) return 0;
      return typeof charge === 'number' ? charge : parseFloat(String(charge));
    })(),
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize building data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeBuilding(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    description: data.description ?? undefined,
    address: data.address ?? undefined,
    color: data.color ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize project data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeProject(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    description: data.description ?? undefined,
    color: data.color ?? undefined,
    installmentPlan: data.installment_plan ?? data.installmentPlan ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize contact data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeContact(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    type: data.type,
    contactNo: data.contact_no ?? data.contactNo ?? undefined,
    email: data.email ?? undefined,
    address: data.address ?? undefined,
    notes: data.notes ?? undefined,
    openingBalance: (() => {
      const balance = data.opening_balance ?? data.openingBalance;
      if (balance == null) return undefined;
      return typeof balance === 'number' ? balance : parseFloat(String(balance));
    })(),
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize account data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeAccount(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    type: data.type,
    balance: (() => {
      const bal = data.balance;
      if (bal == null) return 0;
      return typeof bal === 'number' ? bal : parseFloat(String(bal));
    })(),
    description: data.description ?? undefined,
    isPermanent: data.is_permanent ?? data.isPermanent ?? false,
    parentAccountId: data.parent_account_id ?? data.parentAccountId ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize category data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeCategory(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    type: data.type,
    description: data.description ?? undefined,
    isPermanent: data.is_permanent ?? data.isPermanent ?? false,
    isRental: data.is_rental ?? data.isRental ?? false,
    parentCategoryId: data.parent_category_id ?? data.parentCategoryId ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize budget data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeBudget(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    categoryId: data.category_id ?? data.categoryId ?? '',
    amount: (() => {
      const amt = data.amount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    projectId: data.project_id ?? data.projectId ?? undefined,
  };
}

/**
 * Normalize invoice data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeInvoice(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    invoiceNumber: data.invoice_number ?? data.invoiceNumber ?? '',
    contactId: data.contact_id ?? data.contactId ?? '',
    amount: (() => {
      const amt = data.amount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    paidAmount: (() => {
      const amt = data.paid_amount ?? data.paidAmount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    status: data.status ?? 'Unpaid',
    issueDate: data.issue_date ?? data.issueDate ?? '',
    dueDate: data.due_date ?? data.dueDate ?? '',
    invoiceType: data.invoice_type ?? data.invoiceType ?? 'Sales',
    description: data.description ?? undefined,
    projectId: data.project_id ?? data.projectId ?? undefined,
    buildingId: data.building_id ?? data.buildingId ?? undefined,
    propertyId: data.property_id ?? data.propertyId ?? undefined,
    unitId: data.unit_id ?? data.unitId ?? undefined,
    categoryId: data.category_id ?? data.categoryId ?? undefined,
    agreementId: data.agreement_id ?? data.agreementId ?? undefined,
    securityDepositCharge: (() => {
      const charge = data.security_deposit_charge ?? data.securityDepositCharge;
      if (charge == null) return undefined;
      return typeof charge === 'number' ? charge : parseFloat(String(charge));
    })(),
    serviceCharges: (() => {
      const charges = data.service_charges ?? data.serviceCharges;
      if (charges == null) return undefined;
      return typeof charges === 'number' ? charges : parseFloat(String(charges));
    })(),
    rentalMonth: data.rental_month ?? data.rentalMonth ?? undefined,
  };
}

/**
 * Normalize bill data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeBill(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    billNumber: data.bill_number ?? data.billNumber ?? '',
    contactId: data.contact_id ?? data.contactId ?? '',
    amount: (() => {
      const amt = data.amount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    paidAmount: (() => {
      const amt = data.paid_amount ?? data.paidAmount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    status: data.status ?? 'Unpaid',
    issueDate: data.issue_date ?? data.issueDate ?? '',
    dueDate: data.due_date ?? data.dueDate ?? undefined,
    description: data.description ?? undefined,
    categoryId: data.category_id ?? data.categoryId ?? undefined,
    projectId: data.project_id ?? data.projectId ?? undefined,
    buildingId: data.building_id ?? data.buildingId ?? undefined,
    propertyId: data.property_id ?? data.propertyId ?? undefined,
    projectAgreementId: data.project_agreement_id ?? data.projectAgreementId ?? undefined,
    contractId: data.contract_id ?? data.contractId ?? undefined,
    staffId: data.staff_id ?? data.staffId ?? undefined,
    expenseCategoryItems: data.expense_category_items ?? data.expenseCategoryItems ?? undefined,
    documentPath: data.document_path ?? data.documentPath ?? undefined,
  };
}

/**
 * Normalize transaction data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeTransaction(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    date: data.date ?? '',
    type: data.type ?? 'expense',
    amount: (() => {
      const amt = data.amount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    description: data.description ?? undefined,
    accountId: data.account_id ?? data.accountId ?? '',
    categoryId: data.category_id ?? data.categoryId ?? undefined,
    projectId: data.project_id ?? data.projectId ?? undefined,
    contactId: data.contact_id ?? data.contactId ?? undefined,
    invoiceId: data.invoice_id ?? data.invoiceId ?? undefined,
    billId: data.bill_id ?? data.billId ?? undefined,
    buildingId: data.building_id ?? data.buildingId ?? undefined,
    propertyId: data.property_id ?? data.propertyId ?? undefined,
    unitId: data.unit_id ?? data.unitId ?? undefined,
    rentalAgreementId: data.rental_agreement_id ?? data.rentalAgreementId ?? undefined,
    projectAgreementId: data.project_agreement_id ?? data.projectAgreementId ?? undefined,
    contractId: data.contract_id ?? data.contractId ?? undefined,
    isSystemGenerated: data.is_system_generated ?? data.isSystemGenerated ?? false,
    reference: data.reference ?? undefined,
    paymentMethod: data.payment_method ?? data.paymentMethod ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize rental agreement data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeRentalAgreement(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    agreementNumber: data.agreement_number ?? data.agreementNumber ?? '',
    contactId: data.contact_id ?? data.contactId ?? '',
    propertyId: data.property_id ?? data.propertyId ?? '',
    startDate: data.start_date ?? data.startDate ?? '',
    endDate: data.end_date ?? data.endDate ?? '',
    monthlyRent: (() => {
      const rent = data.monthly_rent ?? data.monthlyRent;
      if (rent == null) return 0;
      return typeof rent === 'number' ? rent : parseFloat(String(rent));
    })(),
    rentDueDate: data.rent_due_date ?? data.rentDueDate ?? undefined,
    status: data.status ?? 'Active',
    description: data.description ?? undefined,
    securityDeposit: (() => {
      const deposit = data.security_deposit ?? data.securityDeposit;
      if (deposit == null) return undefined;
      return typeof deposit === 'number' ? deposit : parseFloat(String(deposit));
    })(),
    brokerId: data.broker_id ?? data.brokerId ?? undefined,
    brokerFee: (() => {
      const fee = data.broker_fee ?? data.brokerFee;
      if (fee == null) return undefined;
      return typeof fee === 'number' ? fee : parseFloat(String(fee));
    })(),
    ownerId: data.owner_id ?? data.ownerId ?? undefined,
    orgId: data.org_id ?? data.orgId ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize project agreement data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeProjectAgreement(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    agreementNumber: data.agreement_number ?? data.agreementNumber ?? '',
    contactId: data.contact_id ?? data.contactId ?? '',
    projectId: data.project_id ?? data.projectId ?? '',
    unitId: data.unit_id ?? data.unitId ?? undefined,
    totalAmount: (() => {
      const amt = data.total_amount ?? data.totalAmount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    paidAmount: (() => {
      const amt = data.paid_amount ?? data.paidAmount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    status: data.status ?? 'Active',
    agreementDate: data.agreement_date ?? data.agreementDate ?? '',
    installmentPlan: data.installment_plan ?? data.installmentPlan ?? undefined,
    description: data.description ?? undefined,
    brokerId: data.broker_id ?? data.brokerId ?? undefined,
    brokerFee: (() => {
      const fee = data.broker_fee ?? data.brokerFee;
      if (fee == null) return undefined;
      return typeof fee === 'number' ? fee : parseFloat(String(fee));
    })(),
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize contract data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeContract(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    contractNumber: data.contract_number ?? data.contractNumber ?? '',
    contactId: data.contact_id ?? data.contactId ?? '',
    projectId: data.project_id ?? data.projectId ?? undefined,
    buildingId: data.building_id ?? data.buildingId ?? undefined,
    propertyId: data.property_id ?? data.propertyId ?? undefined,
    totalAmount: (() => {
      const amt = data.total_amount ?? data.totalAmount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    paidAmount: (() => {
      const amt = data.paid_amount ?? data.paidAmount;
      if (amt == null) return 0;
      return typeof amt === 'number' ? amt : parseFloat(String(amt));
    })(),
    status: data.status ?? 'Active',
    startDate: data.start_date ?? data.startDate ?? '',
    endDate: data.end_date ?? data.endDate ?? undefined,
    description: data.description ?? undefined,
    userId: data.user_id ?? data.userId ?? undefined,
    createdAt: data.created_at ?? data.createdAt ?? undefined,
    updatedAt: data.updated_at ?? data.updatedAt ?? undefined,
  };
}

/**
 * Normalize plan amenity data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizePlanAmenity(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    name: data.name || '',
    price: parseFloat(data.price) || 0,
    isPercentage: data.is_percentage ?? data.isPercentage ?? false,
    isActive: data.is_active ?? data.isActive ?? true,
    description: data.description,
    createdAt: data.created_at ?? data.createdAt,
    updatedAt: data.updated_at ?? data.updatedAt,
  };
}

/**
 * Normalize installment plan data from API/WebSocket (snake_case) to client format (camelCase)
 */
function normalizeInstallmentPlan(data: any): any {
  if (!data) return data;
  return {
    id: data.id,
    projectId: data.project_id ?? data.projectId,
    leadId: data.lead_id ?? data.leadId,
    unitId: data.unit_id ?? data.unitId,
    durationYears: data.duration_years ?? data.durationYears,
    downPaymentPercentage: parseFloat(data.down_payment_percentage ?? data.downPaymentPercentage) || 0,
    frequency: data.frequency,
    listPrice: parseFloat(data.list_price ?? data.listPrice) || 0,
    customerDiscount: parseFloat(data.customer_discount ?? data.customerDiscount) || 0,
    floorDiscount: parseFloat(data.floor_discount ?? data.floorDiscount) || 0,
    lumpSumDiscount: parseFloat(data.lump_sum_discount ?? data.lumpSumDiscount) || 0,
    miscDiscount: parseFloat(data.misc_discount ?? data.miscDiscount) || 0,
    netValue: parseFloat(data.net_value ?? data.netValue) || 0,
    downPaymentAmount: parseFloat(data.down_payment_amount ?? data.downPaymentAmount) || 0,
    installmentAmount: parseFloat(data.installment_amount ?? data.installmentAmount) || 0,
    totalInstallments: data.total_installments ?? data.totalInstallments,
    description: data.description,
    introText: data.intro_text ?? data.introText,
    version: data.version ?? 1,
    rootId: data.root_id ?? data.rootId,
    status: data.status ?? 'Draft',
    approvalRequestedById: data.approval_requested_by ?? data.approvalRequestedById,
    approvalRequestedToId: data.approval_requested_to ?? data.approvalRequestedToId,
    approvalRequestedAt: data.approval_requested_at ?? data.approvalRequestedAt,
    approvalReviewedById: data.approval_reviewed_by ?? data.approvalReviewedById,
    approvalReviewedAt: data.approval_reviewed_at ?? data.approvalReviewedAt,
    userId: data.user_id ?? data.userId,
    customerDiscountCategoryId: data.customer_discount_category_id ?? data.customerDiscountCategoryId,
    floorDiscountCategoryId: data.floor_discount_category_id ?? data.floorDiscountCategoryId,
    lumpSumDiscountCategoryId: data.lump_sum_discount_category_id ?? data.lumpSumDiscountCategoryId,
    miscDiscountCategoryId: data.misc_discount_category_id ?? data.miscDiscountCategoryId,
    selectedAmenities: typeof data.selected_amenities === 'string' ? JSON.parse(data.selected_amenities) : (data.selected_amenities ?? data.selectedAmenities ?? []),
    amenitiesTotal: parseFloat(data.amenities_total ?? data.amenitiesTotal) || 0,
    createdAt: data.created_at ?? data.createdAt,
    updatedAt: data.updated_at ?? data.updatedAt,
  };
}

/**
 * Get the appropriate normalizer function for an entity type
 */
function getEntityNormalizer(entity: string): ((data: any) => any) | null {
  switch (entity) {
    case 'unit': return normalizeUnit;
    case 'property': return normalizeProperty;
    case 'building': return normalizeBuilding;
    case 'project': return normalizeProject;
    case 'contact': return normalizeContact;
    case 'account': return normalizeAccount;
    case 'category': return normalizeCategory;
    case 'budget': return normalizeBudget;
    case 'invoice': return normalizeInvoice;
    case 'bill': return normalizeBill;
    case 'transaction': return normalizeTransaction;
    case 'rental_agreement': return normalizeRentalAgreement;
    case 'project_agreement': return normalizeProjectAgreement;
    case 'contract': return normalizeContract;
    case 'plan_amenity': return normalizePlanAmenity;
    case 'installment_plan': return normalizeInstallmentPlan;
    default: return null;
  }
}

class RealtimeSyncHandler {
  private wsClient = getWebSocketClient();
  private lockManager = getLockManager();
  private isInitialized = false;
  private dispatchCallback: ((action: AppAction) => void) | null = null;
  private currentUserId: string | null = null;

  /**
   * Set the dispatch callback from AppContext
   * This allows us to update React state when WebSocket events are received
   */
  setDispatch(dispatch: (action: AppAction) => void): void {
    this.dispatchCallback = dispatch;
  }

  /**
   * Set the current user ID to skip events from self
   * This prevents duplicates when the creator receives their own WebSocket event
   */
  setCurrentUserId(userId: string | null): void {
    this.currentUserId = userId;
    console.log(`[RealtimeSyncHandler] 👤 Current user ID set to: ${userId || 'null'}`);
  }

  /**
   * Initialize real-time sync handler
   */
  initialize(): void {
    if (this.isInitialized) {
      return;
    }

    // Set up WebSocket listeners for all entity update events
    this.setupEntityUpdateListeners();

    this.isInitialized = true;
    console.log('[RealtimeSyncHandler] ✅ Initialized real-time sync handler');
  }

  /**
   * Setup WebSocket listeners for entity update events
   */
  private setupEntityUpdateListeners(): void {
    // Listen to all server events defined in EVENT_MAP
    Object.keys(EVENT_MAP).forEach(eventName => {
      this.wsClient.on(eventName, (data: any) => {
        this.handleEntityEvent(eventName, data);
      });
    });

    console.log(`[RealtimeSyncHandler] 📡 Listening to ${Object.keys(EVENT_MAP).length} WebSocket events`);
  }

  /**
   * Handle entity event from WebSocket
   */
  private async handleEntityEvent(eventName: string, data: any): Promise<void> {
    try {
      const eventInfo = EVENT_MAP[eventName];
      if (!eventInfo) {
        console.warn(`[RealtimeSyncHandler] Unknown event: ${eventName}`);
        return;
      }

      const { entity, action } = eventInfo;
      
      // Check if this event is from the current user (skip to prevent duplicates)
      // This is critical for preventing the creator from seeing their own record twice
      const eventUserId = data?.userId || data?.user_id;
      if (eventUserId && this.currentUserId && eventUserId === this.currentUserId) {
        console.log(`[RealtimeSyncHandler] ⏭️ Skipping own event: ${eventName} (userId: ${eventUserId})`);
        return;
      }
      
      // Extract entity data from server response
      // Server sends: { transaction: {...}, userId, username, timestamp } or { contact: {...}, ... }
      // The entity key might be singular (transaction) or plural (transactions)
      let entityData = data[entity] || data[`${entity}s`];
      
      // If not found, try common variations
      if (!entityData) {
        // Try camelCase versions
        const camelEntity = entity.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        entityData = data[camelEntity] || data[`${camelEntity}s`];
      }
      
      // If still not found, try entity-specific aliases
      // Server sends { agreement: ... } for rental_agreement and project_agreement
      // Server sends { salesReturn: ... } for sales_return
      if (!entityData) {
        const entityAliases: Record<string, string[]> = {
          'rental_agreement': ['agreement', 'rentalAgreement'],
          'project_agreement': ['agreement', 'projectAgreement'],
          'sales_return': ['salesReturn'],
        };
        const aliases = entityAliases[entity];
        if (aliases) {
          console.log(`[RealtimeSyncHandler] 🔍 Trying aliases for ${entity}:`, aliases, 'data keys:', Object.keys(data));
          for (const alias of aliases) {
            if (data[alias]) {
              entityData = data[alias];
              console.log(`[RealtimeSyncHandler] ✅ Found entity data using alias '${alias}'`);
              break;
            }
          }
        }
      }
      
      // If still not found, the data itself might be the entity
      if (!entityData) {
        entityData = data;
      }
      
      // Extract entity ID - handle different naming conventions
      // For create/update events: entity has { id: '...' }
      // For delete events: server sends { transactionId: '...', invoiceId: '...', agreementId: '...' } etc.
      let entityId = entityData?.id;
      
      // If no 'id' field, check for entity-specific ID fields (used in delete events)
      if (!entityId) {
        // Build possible ID field names based on entity type
        // e.g., 'transaction' -> 'transactionId', 'rental_agreement' -> 'agreementId'
        const camelEntity = entity.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        const possibleIdFields = [
          `${camelEntity}Id`,           // e.g., 'transactionId', 'invoiceId'
          `${entity}Id`,                // e.g., 'transaction_id' (unlikely but covered)
          `${entity}_id`,               // e.g., 'rental_agreement_id'
          'agreementId',                // For rental_agreement and project_agreement
          'id',                         // Fallback
        ];
        
        for (const field of possibleIdFields) {
          if (data[field]) {
            entityId = data[field];
            console.log(`[RealtimeSyncHandler] 🔍 Found entity ID using field '${field}': ${entityId}`);
            break;
          }
        }
      }

      if (!entityId) {
        console.warn(`[RealtimeSyncHandler] No ID found in event data for ${eventName}:`, data);
        return;
      }

      console.log(`[RealtimeSyncHandler] 📥 ${eventName}: ${entityId}`);

      // Check if we have a lock on this entity (if so, ignore - it's our own change)
      const lock = this.lockManager.getLock(entity, entityId);
      if (lock) {
        console.log(`[RealtimeSyncHandler] ⏭️ Ignoring own change (lock): ${entity}:${entityId}`);
        return;
      }

      // Mark action as remote to prevent re-syncing to API
      const actionKey = `${entity}:${action}`;
      const actionType = ACTION_TYPE_MAP[actionKey] as AppAction['type'];

      if (!actionType) {
        console.warn(`[RealtimeSyncHandler] No action type mapped for ${actionKey}`);
        return;
      }

      // Create AppAction based on action type
      let appAction: AppAction | null = null;

      // Normalize entity data from snake_case to camelCase before dispatching
      // This ensures the client state uses consistent field names (camelCase)
      // while the database uses snake_case
      const normalizer = getEntityNormalizer(entity);
      const normalizedData = normalizer ? normalizer(entityData) : entityData;
      
      if (normalizer) {
        console.log(`[RealtimeSyncHandler] 🔄 Normalized ${entity} data:`, { 
          original: entityData?.id, 
          normalized: normalizedData?.id,
          hasNormalizer: true 
        });
      } else {
        console.log(`[RealtimeSyncHandler] ⚠️ No normalizer found for ${entity}, using raw data`);
      }

      switch (action) {
        case 'create':
        case 'update':
          appAction = {
            type: actionType,
            payload: normalizedData,
            _isRemote: true, // Mark as remote to prevent re-syncing
          } as AppAction;
          break;
        case 'delete':
          appAction = {
            type: actionType,
            payload: entityId,
            _isRemote: true, // Mark as remote to prevent re-syncing
          } as AppAction;
          break;
      }

      if (appAction && this.dispatchCallback) {
        // Dispatch to AppContext to update React state
        this.dispatchCallback(appAction);
        console.log(`[RealtimeSyncHandler] ✅ Dispatched ${actionType} for ${entity}:${entityId}`);
      }

      // Also update local database (desktop only)
      if (!isMobileDevice()) {
        try {
          if (action === 'create' || action === 'update') {
            await this.updateLocalDatabase(entity, entityId, entityData, action);
          } else if (action === 'delete') {
            await this.deleteFromLocalDatabase(entity, entityId);
          }
          console.log(`[RealtimeSyncHandler] ✅ Updated local database for ${entity}:${entityId}`);
        } catch (error) {
          console.error(`[RealtimeSyncHandler] ❌ Failed to update local database for ${entity}:${entityId}`, error);
          // Don't throw - state update is more important than local DB update
        }
      }
    } catch (error) {
      console.error(`[RealtimeSyncHandler] ❌ Failed to handle event ${eventName}:`, error);
    }
  }

  /**
   * Update local database with entity data (desktop only)
   */
  private async updateLocalDatabase(
    entity: string,
    entityId: string,
    data: any,
    action: 'create' | 'update'
  ): Promise<void> {
    const dbService = getDatabaseService();

    if (!dbService.isReady()) {
      console.warn('[RealtimeSyncHandler] Local database not ready, skipping update');
      return;
    }

    try {
      // Map entity names to table names
      const tableMap: Record<string, string> = {
        'transaction': 'transactions',
        'transactions': 'transactions',
        'contact': 'contacts',
        'contacts': 'contacts',
        'account': 'accounts',
        'accounts': 'accounts',
        'category': 'categories',
        'categories': 'categories',
        'project': 'projects',
        'projects': 'projects',
        'invoice': 'invoices',
        'invoices': 'invoices',
        'bill': 'bills',
        'bills': 'bills',
        'building': 'buildings',
        'buildings': 'buildings',
        'property': 'properties',
        'properties': 'properties',
        'unit': 'units',
        'units': 'units',
        'rental_agreement': 'rental_agreements',
        'rental_agreements': 'rental_agreements',
        'project_agreement': 'project_agreements',
        'project_agreements': 'project_agreements',
        'contract': 'contracts',
        'contracts': 'contracts',
        'budget': 'budgets',
        'budgets': 'budgets',
        'plan_amenity': 'plan_amenities',
        'plan_amenities': 'plan_amenities',
        'installment_plan': 'installment_plans',
        'installment_plans': 'installment_plans',
      };

      const tableName = tableMap[entity] || entity;

      // Build SQL based on action
      if (action === 'create' || action === 'update') {
        // Normalize data for local schema differences
        const dbData = tableName === 'rental_agreements'
          ? this.normalizeRentalAgreementForLocal(data)
          : data;

        // Use INSERT OR REPLACE for upsert behavior
        const columns = Object.keys(dbData).join(', ');
        const placeholders = Object.keys(dbData).map(() => '?').join(', ');
        const values = Object.values(dbData);

        const sql = `INSERT OR REPLACE INTO ${tableName} (${columns}) VALUES (${placeholders})`;
        dbService.execute(sql, values);
        dbService.save();
      }
    } catch (error) {
      console.error(`[RealtimeSyncHandler] Failed to update local database for ${entity}:${entityId}`, error);
      throw error;
    }
  }

  /**
   * Delete entity from local database (desktop only)
   */
  private async deleteFromLocalDatabase(entity: string, entityId: string): Promise<void> {
    const dbService = getDatabaseService();

    if (!dbService.isReady()) {
      console.warn('[RealtimeSyncHandler] Local database not ready, skipping delete');
      return;
    }

    try {
      // Map entity names to table names
      const tableMap: Record<string, string> = {
        'transaction': 'transactions',
        'transactions': 'transactions',
        'contact': 'contacts',
        'contacts': 'contacts',
        'account': 'accounts',
        'accounts': 'accounts',
        'category': 'categories',
        'categories': 'categories',
        'project': 'projects',
        'projects': 'projects',
        'invoice': 'invoices',
        'invoices': 'invoices',
        'bill': 'bills',
        'bills': 'bills',
        'building': 'buildings',
        'buildings': 'buildings',
        'property': 'properties',
        'properties': 'properties',
        'unit': 'units',
        'units': 'units',
        'rental_agreement': 'rental_agreements',
        'rental_agreements': 'rental_agreements',
        'project_agreement': 'project_agreements',
        'project_agreements': 'project_agreements',
        'contract': 'contracts',
        'contracts': 'contracts',
        'budget': 'budgets',
        'budgets': 'budgets',
        'plan_amenity': 'plan_amenities',
        'plan_amenities': 'plan_amenities',
        'installment_plan': 'installment_plans',
        'installment_plans': 'installment_plans',
      };

      const tableName = tableMap[entity] || entity;

      // Delete from local database
      const sql = `DELETE FROM ${tableName} WHERE id = ?`;
      dbService.execute(sql, [entityId]);
      dbService.save();
    } catch (error) {
      console.error(`[RealtimeSyncHandler] Failed to delete from local database for ${entity}:${entityId}`, error);
      throw error;
    }
  }

  /**
   * Normalize rental agreement payload to match local SQLite schema.
   * Local schema uses:
   * - tenant_id for contact tenant ID (rental tenant)
   * - org_id for organization tenant ID
   */
  private normalizeRentalAgreementForLocal(payload: any): Record<string, any> {
    const contactId =
      payload?.contactId ??
      payload?.contact_id ??
      payload?.tenantId; // Backward compatibility

    const orgId =
      payload?.org_id ??
      payload?.orgId ??
      payload?.org_tenant_id ??
      payload?.orgTenantId ??
      payload?.tenant_id;

    const normalized: Record<string, any> = {
      id: payload?.id,
      agreement_number: payload?.agreement_number ?? payload?.agreementNumber,
      contact_id: contactId,
      property_id: payload?.property_id ?? payload?.propertyId,
      start_date: payload?.start_date ?? payload?.startDate,
      end_date: payload?.end_date ?? payload?.endDate,
      monthly_rent: payload?.monthly_rent ?? payload?.monthlyRent,
      rent_due_date: payload?.rent_due_date ?? payload?.rentDueDate,
      status: payload?.status,
      description: payload?.description,
      security_deposit: payload?.security_deposit ?? payload?.securityDeposit,
      broker_id: payload?.broker_id ?? payload?.brokerId,
      broker_fee: payload?.broker_fee ?? payload?.brokerFee,
      owner_id: payload?.owner_id ?? payload?.ownerId,
      org_id: orgId,
      user_id: payload?.user_id ?? payload?.userId,
      created_at: payload?.created_at ?? payload?.createdAt,
      updated_at: payload?.updated_at ?? payload?.updatedAt,
    };

    // Remove undefined values to avoid inserting unknown/empty columns
    return Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined)
    );
  }

  /**
   * Cleanup
   */
  destroy(): void {
    // WebSocket listeners are managed by the WebSocket client
    this.isInitialized = false;
    this.dispatchCallback = null;
    this.currentUserId = null;
  }
}

// Singleton instance
let realtimeSyncHandlerInstance: RealtimeSyncHandler | null = null;

export function getRealtimeSyncHandler(): RealtimeSyncHandler {
  if (!realtimeSyncHandlerInstance) {
    realtimeSyncHandlerInstance = new RealtimeSyncHandler();
  }
  return realtimeSyncHandlerInstance;
}
