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
};

class RealtimeSyncHandler {
  private wsClient = getWebSocketClient();
  private lockManager = getLockManager();
  private isInitialized = false;
  private dispatchCallback: ((action: AppAction) => void) | null = null;

  /**
   * Set the dispatch callback from AppContext
   * This allows us to update React state when WebSocket events are received
   */
  setDispatch(dispatch: (action: AppAction) => void): void {
    this.dispatchCallback = dispatch;
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
      
      // If still not found, the data itself might be the entity
      if (!entityData) {
        entityData = data;
      }
      
      const entityId = entityData?.id;

      if (!entityId) {
        console.warn(`[RealtimeSyncHandler] No ID found in event data for ${eventName}:`, data);
        return;
      }

      console.log(`[RealtimeSyncHandler] 📥 ${eventName}: ${entityId}`);

      // Check if we have a lock on this entity (if so, ignore - it's our own change)
      const lock = this.lockManager.getLock(entity, entityId);
      if (lock) {
        console.log(`[RealtimeSyncHandler] ⏭️ Ignoring own change: ${entity}:${entityId}`);
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

      switch (action) {
        case 'create':
        case 'update':
          appAction = {
            type: actionType,
            payload: entityData,
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
