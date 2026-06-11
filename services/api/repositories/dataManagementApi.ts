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

  /**
   * Factory reset — wipe all organization data and restore fresh-install chart.
   * Requires: Admin role (users.manage)
   */
  async factoryReset(): Promise<{
    success: boolean;
    message: string;
    details: {
      recordsDeleted: number;
      tablesCleared: number;
    };
  }> {
    return apiClient.delete('/data-management/factory-reset');
  }

}

export const dataManagementApi = new DataManagementApiRepository();

