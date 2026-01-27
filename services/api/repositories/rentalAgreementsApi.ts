/**
 * Rental Agreements API Repository
 * 
 * Provides API-based access to rental agreements data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { RentalAgreement } from '../../../types';

export class RentalAgreementsApiRepository {
  /**
   * Get all rental agreements
   */
  async findAll(filters?: { status?: string; propertyId?: string }): Promise<RentalAgreement[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    
    const query = params.toString();
    return apiClient.get<RentalAgreement[]>(`/rental-agreements${query ? `?${query}` : ''}`);
  }

  /**
   * Get rental agreement by ID
   */
  async findById(id: string): Promise<RentalAgreement | null> {
    try {
      return await apiClient.get<RentalAgreement>(`/rental-agreements/${id}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new rental agreement
   */
  async create(agreement: Partial<RentalAgreement>): Promise<RentalAgreement> {
    return apiClient.post<RentalAgreement>('/rental-agreements', agreement);
  }

  /**
   * Update an existing rental agreement
   */
  async update(id: string, agreement: Partial<RentalAgreement>): Promise<RentalAgreement> {
    return apiClient.put<RentalAgreement>(`/rental-agreements/${id}`, agreement);
  }

  /**
   * Delete a rental agreement
   */
  async delete(id: string): Promise<void> {
    await apiClient.delete(`/rental-agreements/${id}`);
  }

  /**
   * Check if rental agreement exists
   */
  async exists(id: string): Promise<boolean> {
    const agreement = await this.findById(id);
    return agreement !== null;
  }
}

