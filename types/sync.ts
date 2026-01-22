/**
 * Sync System Type Definitions
 * 
 * Types for offline sync queue and connection monitoring
 */

export type SyncOperationType = 
  | 'transaction'
  | 'contact'
  | 'invoice'
  | 'bill'
  | 'project'
  | 'building'
  | 'property'
  | 'unit'
  | 'budget'
  | 'rental_agreement'
  | 'project_agreement'
  | 'contract'
  | 'sales_return'
  | 'quotation'
  | 'document'
  | 'account'
  | 'category'
  | 'recurring_invoice_template'
  | 'plan_amenity'
  | 'pm_cycle_allocation';

export type SyncAction = 'create' | 'update' | 'delete';

export type SyncStatus = 'pending' | 'syncing' | 'completed' | 'failed';

export interface SyncQueueItem {
  id: string;
  tenantId: string;
  userId: string;
  type: SyncOperationType;
  action: SyncAction;
  data: any;
  timestamp: number;
  retryCount: number;
  status: SyncStatus;
  error?: string;
  lastAttempt?: number;
}

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  current?: SyncQueueItem;
}

export type ConnectionStatus = 'online' | 'offline' | 'checking';

export interface ConnectionState {
  status: ConnectionStatus;
  lastChecked: number;
  lastOnline?: number;
  lastOffline?: number;
}

export type SyncEngineStatus = 'idle' | 'syncing' | 'paused' | 'error';

export interface SyncEngineState {
  status: SyncEngineStatus;
  progress: SyncProgress;
  isRunning: boolean;
  error?: string;
}
