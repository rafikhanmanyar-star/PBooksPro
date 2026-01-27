import { apiClient } from '../client';

/**
 * Data Management API Repository
 * Handles administrative data management operations
 */
export class DataManagementApiRepository {
  /**
   * Clear all transaction-related data
   * Requires: Admin role
   * Clears: Transactions, invoices, bills, contracts, agreements, sales returns
   * Preserves: Accounts, contacts, categories, projects, buildings, properties, units, settings
   */
  async clearTransactions(): Promise<{
    success: boolean;
    message: string;
    details: {
      recordsDeleted: number;
      tablesCleared: number;
      accountsReset: number;
    };
  }> {
    return apiClient.delete('/data-management/clear-transactions');
  }
}

export const dataManagementApi = new DataManagementApiRepository();

