import { apiClient } from '../client';
import { Quotation } from '../../../types';
import type { PaginatedResponse } from '../../../shared/types/pagination';
import { appendEntitySearchParams } from '../entitySearchParams';

export class QuotationsApiRepository {
  async findAll(): Promise<Quotation[]> {
    return apiClient.get<Quotation[]>('/quotations');
  }

  async findPage(params: {
    page: number;
    pageSize: number;
    search?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    vendorId?: string;
  }): Promise<PaginatedResponse<Quotation>> {
    const q = new URLSearchParams();
    appendEntitySearchParams(q, params);
    if (params.vendorId) q.set('vendorId', params.vendorId);
    return apiClient.get<PaginatedResponse<Quotation>>(`/quotations?${q.toString()}`);
  }

  async findById(id: string): Promise<Quotation | null> {
    try {
      return await apiClient.get<Quotation>(`/quotations/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(quotation: Partial<Quotation>): Promise<Quotation> {
    return apiClient.post<Quotation>('/quotations', quotation);
  }

  async update(id: string, quotation: Partial<Quotation>): Promise<Quotation> {
    return apiClient.post<Quotation>('/quotations', { ...quotation, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/quotations/${id}`);
  }

  async exists(id: string): Promise<boolean> {
    const quotation = await this.findById(id);
    return quotation !== null;
  }
}
