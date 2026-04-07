/**
 * Project Agreements API Repository
 *
 * Provides API-based access to project agreements (project selling).
 */

import { apiClient } from '../client';
import { ProjectAgreement, normalizeProjectAgreementStatus } from '../../../types';
import { toLocalDateString } from '../../../utils/dateUtils';

/** Map API JSON (camelCase) to app ProjectAgreement */
export function normalizeProjectAgreementFromApi(raw: Record<string, unknown>): ProjectAgreement {
  const asStatus = normalizeProjectAgreementStatus(raw.status as string | undefined);

  const unitIdsRaw = raw.unitIds ?? raw.unit_ids;
  let unitIds: string[] = [];
  if (Array.isArray(unitIdsRaw)) {
    unitIds = unitIdsRaw.map((x) => String(x));
  } else if (typeof unitIdsRaw === 'string' && unitIdsRaw.trim()) {
    try {
      const p = JSON.parse(unitIdsRaw);
      unitIds = Array.isArray(p) ? p.map((x: unknown) => String(x)) : [];
    } catch {
      unitIds = [];
    }
  }

  const inst = raw.installmentPlan ?? raw.installment_plan;
  let installmentPlan: ProjectAgreement['installmentPlan'];
  if (inst != null && typeof inst === 'object') {
    installmentPlan = inst as ProjectAgreement['installmentPlan'];
  } else if (typeof inst === 'string' && inst.trim()) {
    try {
      installmentPlan = JSON.parse(inst) as ProjectAgreement['installmentPlan'];
    } catch {
      installmentPlan = undefined;
    }
  }

  const cancel = raw.cancellationDetails ?? raw.cancellation_details;
  let cancellationDetails: ProjectAgreement['cancellationDetails'];
  if (cancel != null && typeof cancel === 'object') {
    cancellationDetails = cancel as ProjectAgreement['cancellationDetails'];
  } else if (typeof cancel === 'string' && cancel.trim()) {
    try {
      cancellationDetails = JSON.parse(cancel) as ProjectAgreement['cancellationDetails'];
    } catch {
      cancellationDetails = undefined;
    }
  }

  return {
    id: String(raw.id ?? ''),
    agreementNumber: String(raw.agreementNumber ?? raw.agreement_number ?? ''),
    clientId: String(raw.clientId ?? raw.client_id ?? ''),
    projectId: String(raw.projectId ?? raw.project_id ?? ''),
    unitIds,
    listPrice: Number(raw.listPrice ?? raw.list_price ?? 0),
    customerDiscount: Number(raw.customerDiscount ?? raw.customer_discount ?? 0),
    floorDiscount: Number(raw.floorDiscount ?? raw.floor_discount ?? 0),
    lumpSumDiscount: Number(raw.lumpSumDiscount ?? raw.lump_sum_discount ?? 0),
    miscDiscount: Number(raw.miscDiscount ?? raw.misc_discount ?? 0),
    sellingPrice: Number(raw.sellingPrice ?? raw.selling_price ?? 0),
    rebateAmount:
      raw.rebateAmount != null || raw.rebate_amount != null
        ? Number(raw.rebateAmount ?? raw.rebate_amount)
        : undefined,
    rebateBrokerId:
      raw.rebateBrokerId != null || raw.rebate_broker_id != null
        ? String(raw.rebateBrokerId ?? raw.rebate_broker_id ?? '')
        : undefined,
    issueDate: String(raw.issueDate ?? raw.issue_date ?? toLocalDateString(new Date())),
    description: raw.description != null ? String(raw.description) : undefined,
    status: asStatus,
    cancellationDetails,
    installmentPlan,
    listPriceCategoryId: (raw.listPriceCategoryId ?? raw.list_price_category_id) as string | undefined,
    customerDiscountCategoryId: (raw.customerDiscountCategoryId ??
      raw.customer_discount_category_id) as string | undefined,
    floorDiscountCategoryId: (raw.floorDiscountCategoryId ?? raw.floor_discount_category_id) as string | undefined,
    lumpSumDiscountCategoryId: (raw.lumpSumDiscountCategoryId ??
      raw.lump_sum_discount_category_id) as string | undefined,
    miscDiscountCategoryId: (raw.miscDiscountCategoryId ?? raw.misc_discount_category_id) as string | undefined,
    sellingPriceCategoryId: (raw.sellingPriceCategoryId ?? raw.selling_price_category_id) as string | undefined,
    rebateCategoryId: (raw.rebateCategoryId ?? raw.rebate_category_id) as string | undefined,
    userId: raw.userId != null || raw.user_id != null ? String(raw.userId ?? raw.user_id) : undefined,
    createdAt: raw.createdAt != null || raw.created_at != null ? String(raw.createdAt ?? raw.created_at) : undefined,
    updatedAt: raw.updatedAt != null || raw.updated_at != null ? String(raw.updatedAt ?? raw.updated_at) : undefined,
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

export class ProjectAgreementsApiRepository {
  async findAll(filters?: { status?: string; projectId?: string; clientId?: string }): Promise<ProjectAgreement[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.projectId) params.append('projectId', filters.projectId);
    if (filters?.clientId) params.append('clientId', filters.clientId);

    const query = params.toString();
    const rows = await apiClient.get<Record<string, unknown>[]>(
      `/project-agreements${query ? `?${query}` : ''}`
    );
    return Array.isArray(rows) ? rows.map((r) => normalizeProjectAgreementFromApi(r)) : [];
  }

  async findById(id: string): Promise<ProjectAgreement | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/project-agreements/${id}`);
      return normalizeProjectAgreementFromApi(raw);
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async create(agreement: Partial<ProjectAgreement>): Promise<ProjectAgreement> {
    const raw = await apiClient.post<Record<string, unknown>>('/project-agreements', agreement);
    return normalizeProjectAgreementFromApi(raw);
  }

  async update(id: string, agreement: Partial<ProjectAgreement>): Promise<ProjectAgreement> {
    const raw = await apiClient.put<Record<string, unknown>>(`/project-agreements/${id}`, agreement);
    return normalizeProjectAgreementFromApi(raw);
  }

  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/project-agreements/${id}${qs}`);
  }

  async exists(id: string): Promise<boolean> {
    const agreement = await this.findById(id);
    return agreement !== null;
  }

  async getAgreementInvoices(id: string): Promise<unknown[]> {
    return apiClient.get<unknown[]>(`/project-agreements/${id}/invoices`);
  }
}
