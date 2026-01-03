/**
 * Invoices API Repository
 * 
 * Provides API-based access to invoices data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Invoice } from '../../../types';

export class InvoicesApiRepository {
  /**
   * Get all invoices
   */
  async findAll(filters?: { status?: string; invoiceType?: string; projectId?: string }): Promise<Invoice[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.invoiceType) params.append('invoiceType', filters.invoiceType);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    
    const query = params.toString();
    return apiClient.get<Invoice[]>(`/invoices${query ? `?${query}` : ''}`);
  }

  /**
   * Get invoice by ID
   */
  async findById(id: string): Promise<Invoice | null> {
    try {
      return await apiClient.get<Invoice>(`/invoices/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new invoice
   */
  async create(invoice: Partial<Invoice>): Promise<Invoice> {
    return apiClient.post<Invoice>('/invoices', invoice);
  }

  /**
   * Update an existing invoice
   */
  async update(id: string, invoice: Partial<Invoice>): Promise<Invoice> {
    return apiClient.put<Invoice>(`/invoices/${id}`, invoice);
  }

  /**
   * Delete an invoice
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/invoices/${id}`);
  }

  /**
   * Check if invoice exists
   */
  async exists(id: string): Promise<boolean> {
    const invoice = await this.findById(id);
    return invoice !== null;
  }
}

