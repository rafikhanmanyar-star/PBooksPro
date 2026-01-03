/**
 * Transactions API Repository
 * 
 * Provides API-based access to transactions data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Transaction } from '../../../types';

export interface TransactionFilters {
  projectId?: string | null;
  startDate?: string;
  endDate?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export class TransactionsApiRepository {
  /**
   * Get all transactions with optional filters
   */
  async findAll(filters: TransactionFilters = {}): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (filters.projectId) params.append('projectId', filters.projectId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.type) params.append('type', filters.type);
    if (filters.limit) params.append('limit', filters.limit.toString());
    if (filters.offset) params.append('offset', filters.offset.toString());

    const queryString = params.toString();
    const endpoint = queryString ? `/transactions?${queryString}` : '/transactions';
    
    return apiClient.get<Transaction[]>(endpoint);
  }

  /**
   * Get transaction by ID
   */
  async findById(id: string): Promise<Transaction | null> {
    try {
      return await apiClient.get<Transaction>(`/transactions/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new transaction
   */
  async create(transaction: Partial<Transaction>): Promise<Transaction> {
    return apiClient.post<Transaction>('/transactions', transaction);
  }

  /**
   * Update an existing transaction
   */
  async update(id: string, transaction: Partial<Transaction>): Promise<Transaction> {
    return apiClient.put<Transaction>(`/transactions/${id}`, transaction);
  }

  /**
   * Delete a transaction
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/transactions/${id}`);
  }

  /**
   * Check if transaction exists
   */
  async exists(id: string): Promise<boolean> {
    const transaction = await this.findById(id);
    return transaction !== null;
  }
}

