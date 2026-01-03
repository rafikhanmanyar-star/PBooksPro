/**
 * Contacts API Repository
 * 
 * Provides API-based access to contacts data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Contact } from '../../../types';

export class ContactsApiRepository {
  /**
   * Get all contacts
   */
  async findAll(): Promise<Contact[]> {
    return apiClient.get<Contact[]>('/api/contacts');
  }

  /**
   * Get contact by ID
   */
  async findById(id: string): Promise<Contact | null> {
    try {
      return await apiClient.get<Contact>(`/api/contacts/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new contact
   */
  async create(contact: Partial<Contact>): Promise<Contact> {
    return apiClient.post<Contact>('/api/contacts', contact);
  }

  /**
   * Update an existing contact
   */
  async update(id: string, contact: Partial<Contact>): Promise<Contact> {
    return apiClient.put<Contact>(`/api/contacts/${id}`, contact);
  }

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/api/contacts/${id}`);
  }

  /**
   * Check if contact exists
   */
  async exists(id: string): Promise<boolean> {
    const contact = await this.findById(id);
    return contact !== null;
  }
}

