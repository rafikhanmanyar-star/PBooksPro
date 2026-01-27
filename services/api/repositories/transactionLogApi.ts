/**
 * Transaction Log API Repository
 * 
 * Provides API-based access to transaction audit logs.
 */

import { apiClient } from '../client';
import { TransactionLogEntry } from '../../../types';

export interface LogFilters {
  startDate?: string;
  endDate?: string;
  userId?: string;
  transactionId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export class TransactionLogApiRepository {
  /**
   * Get all logs with optional filters
   */
  async findAll(filters: LogFilters = {}): Promise<TransactionLogEntry[]> {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.transactionId) params.append('transactionId', filters.transactionId);
    if (filters.action) params.append('action', filters.action);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/transaction-audit?${queryString}` : '/transaction-audit';
    
    const response = await apiClient.get<any[]>(endpoint);
    
    // Normalize response to TransactionLogEntry
    return response.map(log => {
      const data = log.action === 'DELETE' ? (log.old_values || log.data) : (log.new_values || log.data);
      let parsedData = data;
      
      if (typeof data === 'string' && data.trim().startsWith('{')) {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          console.warn('Failed to parse log data:', e);
        }
      }

      // Determine entity type - should be 'Transaction' for transaction-related logs to enable restore
      let entityType = log.transaction_type || log.entity_type || 'Transaction';
      if (['INCOME', 'EXPENSE', 'TRANSFER', 'Transactions'].includes(entityType.toUpperCase())) {
        entityType = 'Transaction';
      }

      return {
        id: log.id,
        timestamp: log.created_at || log.timestamp,
        action: log.action as any,
        entityType: entityType,
        entityId: log.transaction_id || log.entity_id,
        description: log.description,
        userId: log.user_id || log.userId,
        userLabel: log.user_name || log.userLabel,
        data: parsedData
      };
    });
  }
}
