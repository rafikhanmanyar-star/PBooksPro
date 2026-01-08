import { apiClient } from '../client';
import { Quotation } from '../../../types';

export class QuotationsApiRepository {
  async findAll(): Promise<Quotation[]> {
    return apiClient.get<Quotation[]>('/quotations');
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
