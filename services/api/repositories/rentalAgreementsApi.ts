/**
 * Rental Agreements API Repository
 * 
 * Provides API-based access to rental agreements data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { RentalAgreement, RentalAgreementStatus } from '../../../types';

/** Map API JSON (camelCase) to app RentalAgreement */
export function normalizeRentalAgreementFromApi(raw: Record<string, unknown>): RentalAgreement {
  const status = (raw.status as string) || RentalAgreementStatus.ACTIVE;
  const asStatus = Object.values(RentalAgreementStatus).includes(status as RentalAgreementStatus)
    ? (status as RentalAgreementStatus)
    : RentalAgreementStatus.ACTIVE;
  return {
    id: String(raw.id ?? ''),
    agreementNumber: String(raw.agreementNumber ?? ''),
    contactId: String(raw.contactId ?? ''),
    propertyId: String(raw.propertyId ?? ''),
    startDate: String(raw.startDate ?? ''),
    endDate: String(raw.endDate ?? ''),
    monthlyRent: Number(raw.monthlyRent ?? 0),
    rentDueDate: Number(raw.rentDueDate ?? 1),
    status: asStatus,
    description: raw.description != null ? String(raw.description) : undefined,
    securityDeposit: raw.securityDeposit != null ? Number(raw.securityDeposit) : undefined,
    brokerId: raw.brokerId != null ? String(raw.brokerId) : undefined,
    brokerFee: raw.brokerFee != null ? Number(raw.brokerFee) : undefined,
    ownerId: raw.ownerId != null ? String(raw.ownerId) : undefined,
    previousAgreementId: raw.previousAgreementId != null ? String(raw.previousAgreementId) : undefined,
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

export class RentalAgreementsApiRepository {
  /**
   * Get all rental agreements
   */
  async findAll(filters?: { status?: string; propertyId?: string }): Promise<RentalAgreement[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.propertyId) params.append('propertyId', filters.propertyId);
    
    const query = params.toString();
    const rows = await apiClient.get<Record<string, unknown>[]>(`/rental-agreements${query ? `?${query}` : ''}`);
    return Array.isArray(rows) ? rows.map((r) => normalizeRentalAgreementFromApi(r)) : [];
  }

  /**
   * Get rental agreement by ID
   */
  async findById(id: string): Promise<RentalAgreement | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/rental-agreements/${id}`);
      return normalizeRentalAgreementFromApi(raw);
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
    const raw = await apiClient.post<Record<string, unknown>>('/rental-agreements', agreement);
    return normalizeRentalAgreementFromApi(raw);
  }

  /**
   * Update an existing rental agreement
   */
  async update(id: string, agreement: Partial<RentalAgreement>): Promise<RentalAgreement> {
    const raw = await apiClient.put<Record<string, unknown>>(`/rental-agreements/${id}`, agreement);
    return normalizeRentalAgreementFromApi(raw);
  }

  /**
   * Delete a rental agreement
   */
  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/rental-agreements/${id}${qs}`);
  }

  /**
   * Check if rental agreement exists
   */
  async exists(id: string): Promise<boolean> {
    const agreement = await this.findById(id);
    return agreement !== null;
  }

  /**
   * Get all invoices linked to a rental agreement
   */
  async getAgreementInvoices(id: string): Promise<any[]> {
    return apiClient.get<any[]>(`/rental-agreements/${id}/invoices`);
  }

  /**
   * Renew a rental agreement (server-side logic)
   */
  async renewAgreement(id: string, data: {
    newAgreementId: string;
    agreementNumber: string;
    startDate: string;
    endDate: string;
    monthlyRent: number;
    rentDueDate: number;
    securityDeposit?: number;
    brokerId?: string;
    brokerFee?: number;
    description?: string;
    ownerId?: string;
    generateInvoices: boolean;
    invoiceSettings?: { prefix: string; padding: number; nextNumber: number };
  }): Promise<{
    oldAgreement: RentalAgreement;
    newAgreement: RentalAgreement;
    generatedInvoices: any[];
    nextInvoiceNumber?: number;
  }> {
    return apiClient.post(`/rental-agreements/${id}/renew`, data);
  }

  /**
   * Terminate a rental agreement (server-side logic)
   */
  async terminateAgreement(id: string, data: {
    endDate: string;
    status: 'Terminated' | 'Expired';
    refundAction: 'COMPANY_REFUND' | 'OWNER_DIRECT' | 'NONE';
    refundAmount?: number;
    refundAccountId?: string;
    notes?: string;
  }): Promise<{
    agreement: RentalAgreement;
    refundTransaction: any;
  }> {
    return apiClient.post(`/rental-agreements/${id}/terminate`, data);
  }
}

