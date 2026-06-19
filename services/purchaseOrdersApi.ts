import { apiClient } from './api/client';
import type { PurchaseOrderReportSummary, TenantPurchaseOrder } from '../types';
import type { PaginatedResponse } from '../shared/types/pagination';
import { appendEntitySearchParams } from './api/entitySearchParams';

export async function fetchPurchaseOrders(params?: {
  status?: string;
  vendorId?: string;
  projectId?: string;
}): Promise<TenantPurchaseOrder[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.vendorId) qs.set('vendorId', params.vendorId);
  if (params?.projectId) qs.set('projectId', params.projectId);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiClient.get<TenantPurchaseOrder[]>(`/purchase-orders${suffix}`);
}

export async function fetchPurchaseOrdersPage(params: {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  status?: string;
  vendorId?: string;
  projectId?: string;
}): Promise<PaginatedResponse<TenantPurchaseOrder>> {
  const q = new URLSearchParams();
  appendEntitySearchParams(q, params);
  if (params.status) q.set('status', params.status);
  if (params.vendorId) q.set('vendorId', params.vendorId);
  if (params.projectId) q.set('projectId', params.projectId);
  return apiClient.get<PaginatedResponse<TenantPurchaseOrder>>(`/purchase-orders?${q.toString()}`);
}

export async function fetchPurchaseOrderById(id: string): Promise<TenantPurchaseOrder> {
  return apiClient.get<TenantPurchaseOrder>(`/purchase-orders/${id}`);
}

export async function savePurchaseOrder(body: Partial<TenantPurchaseOrder>): Promise<TenantPurchaseOrder> {
  return apiClient.post<TenantPurchaseOrder>('/purchase-orders', body);
}

export async function submitPurchaseOrder(id: string, version?: number): Promise<TenantPurchaseOrder> {
  return apiClient.post<TenantPurchaseOrder>(`/purchase-orders/${id}/submit`, { version });
}

export async function approvePurchaseOrder(id: string, version?: number): Promise<TenantPurchaseOrder> {
  return apiClient.post<TenantPurchaseOrder>(`/purchase-orders/${id}/approve`, { version });
}

export async function cancelPurchaseOrder(
  id: string,
  reason?: string,
  version?: number
): Promise<TenantPurchaseOrder> {
  return apiClient.post<TenantPurchaseOrder>(`/purchase-orders/${id}/cancel`, { reason, version });
}

export async function deletePurchaseOrder(id: string, version?: number): Promise<{ id: string }> {
  const qs = version != null ? `?version=${version}` : '';
  return apiClient.delete<{ id: string }>(`/purchase-orders/${id}${qs}`);
}

export async function fetchPurchaseOrderReportSummary(): Promise<PurchaseOrderReportSummary> {
  return apiClient.get<PurchaseOrderReportSummary>('/purchase-orders/report/summary');
}

export type PoBillingLine = {
  id: string;
  itemName?: string;
  description?: string;
  categoryId?: string;
  orderedQty: number;
  receivedQty: number;
  billedQty: number;
  billableQty: number;
  unitRate: number;
  lineTotal: number;
};

export type PoBillingContext = {
  purchaseOrderId: string;
  poNumber: string;
  vendorId: string;
  projectId?: string;
  status: string;
  totalAmount: number;
  receivedAmount: number;
  billedAmount: number;
  billableRemaining: number;
  poRemainingAmount: number;
  lines: PoBillingLine[];
  postedGoodsReceipts: Array<{
    id: string;
    grnNumber: string;
    status: string;
    receivedDate: string;
    lineTotal: number;
  }>;
};

export async function fetchPoBillingContext(
  purchaseOrderId: string,
  excludeBillId?: string
): Promise<PoBillingContext> {
  const qs = excludeBillId ? `?excludeBillId=${encodeURIComponent(excludeBillId)}` : '';
  return apiClient.get<PoBillingContext>(`/purchase-orders/${purchaseOrderId}/billing-context${qs}`);
}
