/**
 * Contracts API Repository
 *
 * Provides API-based access to contracts data.
 */

import { apiClient } from '../client';
import type { Contract } from '../../../types';
import { ContractStatus } from '../../../types';

export function normalizeContractFromApi(raw: Record<string, unknown>): Contract {
  const categoryIds = (() => {
    const ids = raw.categoryIds ?? raw.category_ids;
    if (!ids) return [];
    if (typeof ids === 'string' && ids.trim().length > 0) {
      try {
        const p = JSON.parse(ids);
        return Array.isArray(p) ? (p as string[]) : [];
      } catch {
        return [];
      }
    }
    if (Array.isArray(ids)) return ids as string[];
    return [];
  })();

  const expenseCategoryItems = (() => {
    const items = raw.expenseCategoryItems ?? raw.expense_category_items;
    if (!items) return undefined;
    if (typeof items === 'string' && items.trim().length > 0) {
      try {
        return JSON.parse(items);
      } catch {
        return undefined;
      }
    }
    if (Array.isArray(items)) return items as Contract['expenseCategoryItems'];
    return undefined;
  })();

  const statusRaw = String(raw.status ?? 'Active');
  const status = Object.values(ContractStatus).includes(statusRaw as ContractStatus)
    ? (statusRaw as ContractStatus)
    : statusRaw === 'Pending'
      ? ContractStatus.PENDING
      : ContractStatus.ACTIVE;

  return {
    id: String(raw.id ?? ''),
    contractNumber: String(raw.contractNumber ?? raw.contract_number ?? ''),
    name: String(raw.name ?? ''),
    projectId: String(raw.projectId ?? raw.project_id ?? ''),
    vendorId: String(raw.vendorId ?? raw.vendor_id ?? ''),
    totalAmount: typeof raw.totalAmount === 'number' ? raw.totalAmount : parseFloat(String(raw.total_amount ?? raw.totalAmount ?? '0')),
    area:
      raw.area !== undefined && raw.area !== null
        ? typeof raw.area === 'number'
          ? raw.area
          : parseFloat(String(raw.area))
        : undefined,
    rate:
      raw.rate !== undefined && raw.rate !== null
        ? typeof raw.rate === 'number'
          ? raw.rate
          : parseFloat(String(raw.rate))
        : undefined,
    startDate: String(raw.startDate ?? raw.start_date ?? '').slice(0, 10),
    endDate: String(raw.endDate ?? raw.end_date ?? '').slice(0, 10),
    status,
    categoryIds,
    expenseCategoryItems,
    termsAndConditions: (raw.termsAndConditions ?? raw.terms_and_conditions) as string | undefined,
    paymentTerms: (raw.paymentTerms ?? raw.payment_terms) as string | undefined,
    description: raw.description === undefined || raw.description === null ? undefined : String(raw.description),
    documentPath: (raw.documentPath ?? raw.document_path) as string | undefined,
    documentId: (raw.documentId ?? raw.document_id) as string | undefined,
    retentionType: (raw.retentionType ?? raw.retention_type ?? 'NONE') as Contract['retentionType'],
    retentionPercentage:
      raw.retentionPercentage !== undefined && raw.retentionPercentage !== null
        ? Number(raw.retentionPercentage)
        : raw.retention_percentage !== undefined && raw.retention_percentage !== null
          ? Number(raw.retention_percentage)
          : undefined,
    retentionAmount:
      raw.retentionAmount !== undefined && raw.retentionAmount !== null
        ? Number(raw.retentionAmount)
        : raw.retention_amount !== undefined && raw.retention_amount !== null
          ? Number(raw.retention_amount)
          : undefined,
    retentionReleaseMethod: (raw.retentionReleaseMethod ?? raw.retention_release_method) as Contract['retentionReleaseMethod'],
    retentionReleaseDate: (raw.retentionReleaseDate ?? raw.retention_release_date) as string | undefined,
    retentionNotes: (raw.retentionNotes ?? raw.retention_notes) as string | undefined,
    retentionBalance:
      raw.retentionBalance !== undefined
        ? Number(raw.retentionBalance)
        : raw.retention_balance !== undefined
          ? Number(raw.retention_balance)
          : undefined,
    retentionReleased:
      raw.retentionReleased !== undefined
        ? Number(raw.retentionReleased)
        : raw.retention_released !== undefined
          ? Number(raw.retention_released)
          : undefined,
    retentionReleaseBy: (raw.retentionReleaseBy ?? raw.retention_release_by) as string | undefined,
    approvalStatus: String(raw.approvalStatus ?? raw.approval_status ?? 'Approved'),
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

export class ContractsApiRepository {
  async findAll(filters?: { status?: string; projectId?: string; vendorId?: string }): Promise<Contract[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.vendorId) params.append('vendorId', filters.vendorId);

    const query = params.toString();
    const rows = await apiClient.get<Record<string, unknown>[]>(`/contracts${query ? `?${query}` : ''}`);
    return Array.isArray(rows) ? rows.map((r) => normalizeContractFromApi(r)) : [];
  }

  async findById(id: string): Promise<Contract | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/contracts/${id}`);
      return normalizeContractFromApi(raw);
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /** POST upsert (create or update by id). */
  async create(contract: Partial<Contract>): Promise<Contract> {
    const raw = await apiClient.post<Record<string, unknown>>('/contracts', contract);
    return normalizeContractFromApi(raw);
  }

  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/contracts/${id}${qs}`);
  }
}
