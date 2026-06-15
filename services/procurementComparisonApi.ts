import { apiClient } from './api/client';
import type {
  QuotationComparisonResponse,
  QuotationComparisonSession,
  VendorQuotationComparisonRow,
} from '../types';

export async function fetchProcurementQuotationComparison(params: {
  projectId?: string;
  buildingId?: string;
  packageName?: string;
  categoryId?: string;
  itemName?: string;
}): Promise<QuotationComparisonResponse> {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set('projectId', params.projectId);
  if (params.buildingId) qs.set('buildingId', params.buildingId);
  if (params.packageName) qs.set('packageName', params.packageName);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.itemName) qs.set('itemName', params.itemName);
  const suffix = qs.toString() ? `?${qs}` : '';
  const raw = await apiClient.get<{
    matrix: VendorQuotationComparisonRow[];
    recommended: VendorQuotationComparisonRow | null;
  }>(`/procurement/quotations/comparison${suffix}`);
  const matrix = (raw.matrix ?? []).map(normalizeComparisonRow);
  const recommended = raw.recommended ? normalizeComparisonRow(raw.recommended) : null;
  return { matrix, recommended };
}

function normalizeComparisonRow(row: VendorQuotationComparisonRow): VendorQuotationComparisonRow {
  const unitPrice = row.unitPrice ?? row.rate;
  return { ...row, unitPrice, rate: unitPrice, totalAmount: row.totalAmount ?? unitPrice };
}

export async function createQuotationComparisonSession(body: {
  title?: string;
  projectId?: string;
  buildingId?: string;
  packageName?: string;
  categoryId?: string;
  itemName?: string;
  quotationIds?: string[];
}): Promise<{ session: QuotationComparisonSession; matrix: VendorQuotationComparisonRow[] }> {
  const result = await apiClient.post<{
    session: QuotationComparisonSession;
    matrix: VendorQuotationComparisonRow[];
  }>('/procurement/quotations/comparison/sessions', body);
  return {
    session: result.session,
    matrix: (result.matrix ?? []).map(normalizeComparisonRow),
  };
}

export async function markPreferredQuotation(
  sessionId: string,
  quotationId: string,
  version?: number
): Promise<QuotationComparisonSession> {
  return apiClient.post<QuotationComparisonSession>(
    `/procurement/quotations/comparison/sessions/${sessionId}/prefer`,
    { quotationId, version }
  );
}

export async function approveVendorQuotation(
  quotationId: string,
  body?: { sessionId?: string; version?: number }
): Promise<{ quotation: Record<string, unknown>; session?: QuotationComparisonSession }> {
  return apiClient.post(`/procurement/quotations/${quotationId}/approve`, body ?? {});
}

export async function convertQuotationToPurchaseOrder(
  quotationId: string,
  body?: { sessionId?: string; targetDeliveryDate?: string; description?: string }
): Promise<{
  purchaseOrder: Record<string, unknown>;
  quotation: Record<string, unknown>;
  session?: QuotationComparisonSession;
}> {
  return apiClient.post(`/procurement/quotations/${quotationId}/convert-to-po`, body ?? {});
}
