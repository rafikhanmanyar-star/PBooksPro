import { apiClient } from '../client';
import { RecurringInvoiceTemplate } from '../../../types';

export class RecurringInvoiceTemplatesApiRepository {
  async findAll(): Promise<RecurringInvoiceTemplate[]> {
    return apiClient.get<RecurringInvoiceTemplate[]>('/recurring-invoice-templates');
  }

  async findById(id: string): Promise<RecurringInvoiceTemplate | null> {
    try {
      return await apiClient.get<RecurringInvoiceTemplate>(`/recurring-invoice-templates/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(template: Partial<RecurringInvoiceTemplate>): Promise<RecurringInvoiceTemplate> {
    return apiClient.post<RecurringInvoiceTemplate>('/recurring-invoice-templates', template);
  }

  async update(id: string, template: Partial<RecurringInvoiceTemplate>): Promise<RecurringInvoiceTemplate> {
    return apiClient.post<RecurringInvoiceTemplate>('/recurring-invoice-templates', { ...template, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/recurring-invoice-templates/${id}`);
  }
}
