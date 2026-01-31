/**
 * Data Filter Utility
 * 
 * Separates user-specific data from organization data for synchronization.
 * Only organization data should be synchronized across users in the same tenant.
 */

import { AppState, AppAction } from '../types';

/**
 * User-specific fields that should NOT be synchronized
 * These are UI preferences and user-specific settings
 */
export const USER_SPECIFIC_FIELDS = [
    // UI Preferences
    'enableColorCoding',
    'enableBeepOnSave',
    'enableDatePreservation',
    'lastPreservedDate',
    'showSystemTransactions',
    
    // User-specific settings
    'defaultProjectId',
    'dashboardConfig', // User's visible KPIs configuration
    
    // UI State (should never be synced)
    'currentPage',
    'editingEntity',
    'initialTransactionType',
    'initialTransactionFilter',
    'initialTabs',
    'initialImportType',
    
    // User data
    'currentUser',
] as const;

/**
 * User-specific action types that should NOT trigger synchronization
 */
export const USER_SPECIFIC_ACTIONS = [
    // UI Preferences
    'TOGGLE_COLOR_CODING',
    'TOGGLE_BEEP_ON_SAVE',
    'TOGGLE_DATE_PRESERVATION',
    'TOGGLE_SYSTEM_TRANSACTIONS',
    'UPDATE_DEFAULT_PROJECT',
    'UPDATE_DASHBOARD_CONFIG',
    
    // UI Navigation (already excluded, but listed for clarity)
    'SET_PAGE',
    'SET_EDITING_ENTITY',
    'CLEAR_EDITING_ENTITY',
    'SET_INITIAL_TABS',
    'CLEAR_INITIAL_TABS',
    'SET_INITIAL_TRANSACTION_TYPE',
    'CLEAR_INITIAL_TRANSACTION_TYPE',
    'SET_INITIAL_TRANSACTION_FILTER',
    'SET_INITIAL_IMPORT_TYPE',
    'CLEAR_INITIAL_IMPORT_TYPE',
    
    // User management (handled separately via API)
    'LOGIN',
    'LOGOUT',
    'SET_CURRENT_USER',
] as const;

/**
 * Organization data fields that SHOULD be synchronized
 * These are shared across all users in the organization
 */
export const ORGANIZATION_DATA_FIELDS = [
    // Core entities
    'accounts',
    'contacts',
    'categories',
    'users', // User list (but not currentUser)
    
    // Projects & Properties
    'projects',
    'buildings',
    'properties',
    'units',
    
    // Financial data
    'transactions',
    'invoices',
    'bills',
    'quotations',
    'documents',
    'budgets',
    'planAmenities',
    'installmentPlans',
    
    // Agreements & Contracts
    'rentalAgreements',
    'projectAgreements',
    'salesReturns',
    'contracts',
    
    // Templates & Settings (organization-wide)
    'recurringInvoiceTemplates',
    'agreementSettings',
    'projectAgreementSettings',
    'rentalInvoiceSettings',
    'projectInvoiceSettings',
    'printSettings',
    'whatsAppTemplates',
    'invoiceHtmlTemplate',
    'pmCostPercentage',
    
    // Logs (organization-wide)
    'transactionLog',
    'errorLog',
] as const;

/**
 * Check if an action type should trigger synchronization
 * Returns false for user-specific actions
 */
export function shouldSyncAction(action: AppAction): boolean {
    // Skip if action is marked as remote (already synced)
    if ((action as any)._isRemote) {
        return false;
    }
    
    // Skip user-specific actions
    if (USER_SPECIFIC_ACTIONS.includes(action.type as any)) {
        return false;
    }
    
    // All other actions should sync (they're organization data)
    return true;
}

/**
 * Filter organization data from AppState
 * Returns only the fields that should be synchronized
 */
export function getOrganizationData(state: AppState): Partial<AppState> {
    const orgData: Partial<AppState> = {};
    
    // Copy only organization data fields
    for (const field of ORGANIZATION_DATA_FIELDS) {
        if (field in state) {
            (orgData as any)[field] = (state as any)[field];
        }
    }
    
    // Include version for state management
    if (state.version !== undefined) {
        orgData.version = state.version;
    }
    
    return orgData;
}

/**
 * Check if a field is user-specific
 */
export function isUserSpecificField(field: string): boolean {
    return USER_SPECIFIC_FIELDS.includes(field as any);
}

/**
 * Check if an action is user-specific
 */
export function isUserSpecificAction(actionType: string): boolean {
    return USER_SPECIFIC_ACTIONS.includes(actionType as any);
}

