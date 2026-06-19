/**
 * Transactions API Repository
 * 
 * Provides API-based access to transactions data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Transaction } from '../../../types';
import type { PaginatedResponse } from '../../../shared/types/pagination';
import { appendEntitySearchParams } from '../entitySearchParams';
import { normalizeTransactionFromApi } from '../normalizeTransactionFromApi';

export interface TransactionFilters {
  projectId?: string | null;
  startDate?: string;
  endDate?: string;
  type?: string;
  invoiceId?: string;
  ownerId?: string;
  propertyId?: string;
  /** Only payments linked to rental-module invoices (Rental, Security Deposit, Service Charge). */
  rentalInvoiceOnly?: boolean;
  limit?: number;
  offset?: number;
  cursorDate?: string;
  cursorId?: string;
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
    if (filters.invoiceId) params.append('invoiceId', filters.invoiceId);
    if (filters.ownerId) params.append('ownerId', filters.ownerId);
    if (filters.propertyId) params.append('propertyId', filters.propertyId);
    if (filters.rentalInvoiceOnly) params.append('rentalInvoiceOnly', 'true');
    const limit = filters.limit ?? 500_000;
    params.append('limit', String(limit));
    if (filters.offset) params.append('offset', filters.offset.toString());
    if (filters.cursorDate) params.append('cursorDate', filters.cursorDate);
    if (filters.cursorId) params.append('cursorId', filters.cursorId);

    const queryString = params.toString();
    const endpoint = queryString ? `/transactions?${queryString}` : '/transactions';
    
    const rows = await apiClient.get<Record<string, unknown>[]>(endpoint);
    return rows.map((row) => normalizeTransactionFromApi(row));
  }

  /**
   * Paginated transaction search (PERF-A3.4).
   */
  async findPage(params: {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    filters?: TransactionFilters;
  }): Promise<PaginatedResponse<Transaction>> {
    const q = new URLSearchParams();
    appendEntitySearchParams(q, params);
    const f = params.filters ?? {};
    if (f.projectId) q.set('projectId', f.projectId);
    if (f.startDate) q.set('startDate', f.startDate);
    if (f.endDate) q.set('endDate', f.endDate);
    if (f.type) q.set('type', f.type);
    if (f.invoiceId) q.set('invoiceId', f.invoiceId);
    if (f.ownerId) q.set('ownerId', f.ownerId);
    if (f.propertyId) q.set('propertyId', f.propertyId);
    if (f.rentalInvoiceOnly) q.set('rentalInvoiceOnly', 'true');

    const raw = await apiClient.get<PaginatedResponse<Record<string, unknown>>>(
      `/transactions?${q.toString()}`
    );
    return {
      ...raw,
      data: (raw.data ?? []).map((row) => normalizeTransactionFromApi(row)),
    };
  }

  /**
   * Get transaction by ID
   */
  async findById(id: string): Promise<Transaction | null> {
    try {
      const row = await apiClient.get<Record<string, unknown>>(`/transactions/${id}`);
      return normalizeTransactionFromApi(row);
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
    const saved = await apiClient.post<Record<string, unknown>>('/transactions', transaction);
    return normalizeTransactionFromApi(saved);
  }

  /**
   * Update an existing transaction
   */
  async update(id: string, transaction: Partial<Transaction>): Promise<Transaction> {
    const saved = await apiClient.put<Record<string, unknown>>(`/transactions/${id}`, transaction);
    return normalizeTransactionFromApi(saved);
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

