/**
 * Accounts API Repository
 * 
 * Provides API-based access to accounts data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Account } from '../../../types';

export class AccountsApiRepository {
  /**
   * Get all accounts
   */
  async findAll(): Promise<Account[]> {
    return apiClient.get<Account[]>('/accounts');
  }

  /**
   * Get account by ID
   */
  async findById(id: string): Promise<Account | null> {
    try {
      return await apiClient.get<Account>(`/accounts/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new account (upsert via POST)
   */
  async create(account: Partial<Account>): Promise<Account> {
    const headers: Record<string, string> = {};
    if (account.version != null) {
      headers['X-Entity-Version'] = String(account.version);
    }
    return apiClient.post<Account>('/accounts', account, { headers });
  }

  /**
   * Update an existing account
   */
  async update(id: string, account: Partial<Account>): Promise<Account> {
    return apiClient.put<Account>(`/accounts/${id}`, account);
  }

  /**
   * Delete an account
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/accounts/${id}`);
  }

  /**
   * Check if account exists
   */
  async exists(id: string): Promise<boolean> {
    const account = await this.findById(id);
    return account !== null;
  }
}

