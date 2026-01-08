import { apiClient } from '../client';
import { Document } from '../../../types';

export class DocumentsApiRepository {
  async findAll(entityType?: string, entityId?: string): Promise<Document[]> {
    const params = new URLSearchParams();
    if (entityType) params.append('entity_type', entityType);
    if (entityId) params.append('entity_id', entityId);
    const query = params.toString();
    return apiClient.get<Document[]>(`/documents${query ? `?${query}` : ''}`);
  }

  async findById(id: string): Promise<Document | null> {
    try {
      return await apiClient.get<Document>(`/documents/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(document: Partial<Document>): Promise<Document> {
    return apiClient.post<Document>('/documents', document);
  }

  async update(id: string, document: Partial<Document>): Promise<Document> {
    return apiClient.post<Document>('/documents', { ...document, id });
  }

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/documents/${id}`);
  }
}
