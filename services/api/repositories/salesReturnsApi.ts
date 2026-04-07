/**
 * Sales Returns API Repository
 *
 * Provides API-based access to sales returns data.
 * Replaces direct database access with API calls.
 */

import { apiClient } from '../client';
import { SalesReturn, SalesReturnReason, SalesReturnStatus } from '../../../types';

export function normalizeSalesReturnFromApi(raw: Record<string, unknown>): SalesReturn {
  return {
    id: String(raw.id ?? ''),
    returnNumber: String(raw.returnNumber ?? raw.return_number ?? ''),
    agreementId: String(raw.agreementId ?? raw.agreement_id ?? ''),
    returnDate: String(raw.returnDate ?? raw.return_date ?? '').slice(0, 10),
    reason: (raw.reason ?? SalesReturnReason.CUSTOMER_REQUEST) as SalesReturn['reason'],
    reasonNotes:
      raw.reasonNotes === undefined && raw.reason_notes === undefined
        ? undefined
        : raw.reasonNotes === null || raw.reason_notes === null
          ? undefined
          : String(raw.reasonNotes ?? raw.reason_notes),
    penaltyPercentage: Number(raw.penaltyPercentage ?? raw.penalty_percentage ?? 0),
    penaltyAmount: Number(raw.penaltyAmount ?? raw.penalty_amount ?? 0),
    refundAmount: Number(raw.refundAmount ?? raw.refund_amount ?? 0),
    status: (raw.status ?? SalesReturnStatus.PENDING) as SalesReturn['status'],
    processedDate:
      raw.processedDate === undefined && raw.processed_date === undefined
        ? undefined
        : raw.processedDate === null || raw.processed_date === null
          ? undefined
          : String(raw.processedDate ?? raw.processed_date),
    refundedDate:
      raw.refundedDate === undefined && raw.refunded_date === undefined
        ? undefined
        : raw.refundedDate === null || raw.refunded_date === null
          ? undefined
          : String(raw.refundedDate ?? raw.refunded_date),
    refundBillId:
      raw.refundBillId === undefined && raw.refund_bill_id === undefined
        ? undefined
        : raw.refundBillId === null || raw.refund_bill_id === null
          ? undefined
          : String(raw.refundBillId ?? raw.refund_bill_id),
    createdBy:
      raw.createdBy === undefined && raw.created_by === undefined
        ? undefined
        : raw.createdBy === null || raw.created_by === null
          ? undefined
          : String(raw.createdBy ?? raw.created_by),
    notes: raw.notes === undefined ? undefined : raw.notes === null ? undefined : String(raw.notes),
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

export class SalesReturnsApiRepository {
  /**
   * Get all sales returns
   */
  async findAll(filters?: { status?: string; agreementId?: string }): Promise<SalesReturn[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.agreementId) params.append('agreementId', filters.agreementId);

    const query = params.toString();
    const rows = await apiClient.get<Record<string, unknown>[]>(`/sales-returns${query ? `?${query}` : ''}`);
    return Array.isArray(rows) ? rows.map((r) => normalizeSalesReturnFromApi(r)) : [];
  }

  /**
   * Get sales return by ID
   */
  async findById(id: string): Promise<SalesReturn | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/sales-returns/${id}`);
      return normalizeSalesReturnFromApi(raw);
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create / upsert (POST)
   */
  async create(salesReturn: Partial<SalesReturn>): Promise<SalesReturn> {
    const raw = await apiClient.post<Record<string, unknown>>('/sales-returns', salesReturn);
    return normalizeSalesReturnFromApi(raw);
  }

  /**
   * Delete a sales return
   */
  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/sales-returns/${id}${qs}`);
  }

  /**
   * Check if sales return exists
   */
  async exists(id: string): Promise<boolean> {
    const salesReturn = await this.findById(id);
    return salesReturn !== null;
  }
}

