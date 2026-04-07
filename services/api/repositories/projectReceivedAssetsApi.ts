/**
 * Project received assets API (non-cash payments linked to projects)
 */

import { apiClient } from '../client';
import type { ProjectReceivedAsset } from '../../../types';

export function normalizeProjectReceivedAssetFromApi(raw: Record<string, unknown>): ProjectReceivedAsset {
  return {
    id: String(raw.id ?? ''),
    projectId: String(raw.projectId ?? raw.project_id ?? ''),
    contactId: String(raw.contactId ?? raw.contact_id ?? ''),
    invoiceId:
      raw.invoiceId === undefined && raw.invoice_id === undefined
        ? undefined
        : raw.invoiceId === null || raw.invoice_id === null
          ? null
          : String(raw.invoiceId ?? raw.invoice_id),
    description: String(raw.description ?? ''),
    assetType: (raw.assetType ?? raw.asset_type ?? 'Other') as ProjectReceivedAsset['assetType'],
    recordedValue: Number(raw.recordedValue ?? raw.recorded_value ?? 0),
    receivedDate: String(raw.receivedDate ?? raw.received_date ?? '').slice(0, 10),
    soldDate:
      raw.soldDate === undefined && raw.sold_date === undefined
        ? undefined
        : raw.soldDate === null || raw.sold_date === null
          ? null
          : String(raw.soldDate ?? raw.sold_date).slice(0, 10),
    saleAmount:
      raw.saleAmount === undefined && raw.sale_amount === undefined
        ? undefined
        : raw.saleAmount === null || raw.sale_amount === null
          ? null
          : Number(raw.saleAmount ?? raw.sale_amount),
    saleAccountId:
      raw.saleAccountId === undefined && raw.sale_account_id === undefined
        ? undefined
        : raw.saleAccountId === null || raw.sale_account_id === null
          ? null
          : String(raw.saleAccountId ?? raw.sale_account_id),
    notes:
      raw.notes === undefined ? undefined : raw.notes === null ? null : String(raw.notes),
    version: typeof raw.version === 'number' ? raw.version : undefined,
  };
}

export class ProjectReceivedAssetsApiRepository {
  async findAll(filters?: { projectId?: string }): Promise<ProjectReceivedAsset[]> {
    const params = new URLSearchParams();
    if (filters?.projectId) params.append('projectId', filters.projectId);
    const query = params.toString();
    const rows = await apiClient.get<Record<string, unknown>[]>(
      `/project-received-assets${query ? `?${query}` : ''}`
    );
    return Array.isArray(rows) ? rows.map((r) => normalizeProjectReceivedAssetFromApi(r)) : [];
  }

  async findById(id: string): Promise<ProjectReceivedAsset | null> {
    try {
      const raw = await apiClient.get<Record<string, unknown>>(`/project-received-assets/${id}`);
      return normalizeProjectReceivedAssetFromApi(raw);
    } catch (error: unknown) {
      const err = error as { status?: number };
      if (err.status === 404) return null;
      throw error;
    }
  }

  async create(asset: Partial<ProjectReceivedAsset>): Promise<ProjectReceivedAsset> {
    const raw = await apiClient.post<Record<string, unknown>>('/project-received-assets', asset);
    return normalizeProjectReceivedAssetFromApi(raw);
  }

  async delete(id: string, version?: number): Promise<void> {
    const qs = version != null && Number.isFinite(version) ? `?version=${version}` : '';
    await apiClient.delete(`/project-received-assets/${id}${qs}`);
  }
}
