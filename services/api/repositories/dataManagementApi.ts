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
   * Clear all POS / Shop module data
   * Requires: Admin role
   * Clears: Shop products, inventory, sales, loyalty, branches, terminals, policies
   * Preserves: Finance entities and all non-shop module data
   */
  async clearPosData(): Promise<{
    success: boolean;
    message: string;
    details: {
      recordsDeleted: number;
      tablesCleared: number;
    };
  }> {
    return apiClient.delete('/data-management/clear-pos');
  }
}

export const dataManagementApi = new DataManagementApiRepository();

