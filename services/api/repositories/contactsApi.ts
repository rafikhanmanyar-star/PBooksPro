/**
 * Contacts API Repository
 * 
 * Provides API-based access to contacts data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { Contact } from '../../../types';

/** Map API JSON (camelCase or snake_case) to app Contact */
export function normalizeContactFromApi(api: Record<string, unknown> | Contact): Contact {
  const r = api as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    name: String(r.name ?? ''),
    type: r.type as Contact['type'],
    description: r.description != null ? String(r.description) : undefined,
    contactNo: (r.contactNo ?? r.contact_no) != null ? String(r.contactNo ?? r.contact_no) : undefined,
    companyName: (r.companyName ?? r.company_name) != null ? String(r.companyName ?? r.company_name) : undefined,
    address: r.address != null ? String(r.address) : undefined,
    userId: (r.userId ?? r.user_id) != null ? String(r.userId ?? r.user_id) : undefined,
    version: typeof r.version === 'number' ? r.version : undefined,
    isActive: r.isActive === false ? false : undefined,
  };
}

export class ContactsApiRepository {
  /**
   * Get all contacts
   */
  async findAll(): Promise<Contact[]> {
    return apiClient.get<Contact[]>('/contacts');
  }

  /**
   * Get contact by ID
   */
  async findById(id: string): Promise<Contact | null> {
    try {
      return await apiClient.get<Contact>(`/contacts/${id}`);
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
    console.log('📝 ContactsApiRepository.create called with:', {
      id: contact.id,
      name: contact.name,
      type: contact.type,
      hasDescription: !!contact.description,
      hasContactNo: !!contact.contactNo,
      hasCompanyName: !!contact.companyName,
      hasAddress: !!contact.address
    });
    
    try {
      const result = await apiClient.post<Contact>('/contacts', contact);
      console.log('✅ ContactsApiRepository.create succeeded:', {
        id: result.id,
        name: result.name
      });
      return result;
    } catch (error: any) {
      console.error('❌ ContactsApiRepository.create failed:', {
        error: error,
        errorMessage: error?.message || error?.error || 'Unknown error',
        status: error?.status,
        contact: contact
      });
      throw error;
    }
  }

  /**
   * Update an existing contact
   */
  async update(id: string, contact: Partial<Contact>): Promise<Contact> {
    console.log('📝 ContactsApiRepository.update called for ID:', id, 'with data:', {
      name: contact.name,
      type: contact.type,
      hasDescription: !!contact.description
    });
    
    try {
      const result = await apiClient.put<Contact>(`/contacts/${id}`, contact);
      console.log('✅ ContactsApiRepository.update succeeded:', {
        id: result.id,
        name: result.name
      });
      return result;
    } catch (error: any) {
      if (error?.status === 409 && (error?.code === 'CONFLICT' || error?.code === 'VERSION_CONFLICT')) {
        const msg = error?.message || 'Record was modified by another user';
        throw { ...error, message: msg };
      }
      console.error('❌ ContactsApiRepository.update failed:', {
        error: error,
        errorMessage: error?.message || error?.error || 'Unknown error',
        status: error?.status,
        contactId: id,
        contact: contact
      });
      throw error;
    }
  }

  /**
   * Delete a contact
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/contacts/${id}`);
  }

  /**
   * Check if contact exists
   */
  async exists(id: string): Promise<boolean> {
    const contact = await this.findById(id);
    return contact !== null;
  }
}

