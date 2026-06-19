import { apiClient } from './api/client';
import type { GoodsReceiptReportSummary, TenantGoodsReceipt } from '../types';
import type { PaginatedResponse } from '../shared/types/pagination';
import { appendEntitySearchParams } from './api/entitySearchParams';

export async function fetchGoodsReceipts(params?: {
  status?: string;
  vendorId?: string;
  projectId?: string;
  purchaseOrderId?: string;
}): Promise<TenantGoodsReceipt[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.vendorId) qs.set('vendorId', params.vendorId);
  if (params?.projectId) qs.set('projectId', params.projectId);
  if (params?.purchaseOrderId) qs.set('purchaseOrderId', params.purchaseOrderId);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiClient.get<TenantGoodsReceipt[]>(`/goods-receipts${suffix}`);
}

export async function fetchGoodsReceiptsPage(params: {
  page: number;
  pageSize: number;
  search?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  status?: string;
  vendorId?: string;
  projectId?: string;
  purchaseOrderId?: string;
}): Promise<PaginatedResponse<TenantGoodsReceipt>> {
  const q = new URLSearchParams();
  appendEntitySearchParams(q, params);
  if (params.status) q.set('status', params.status);
  if (params.vendorId) q.set('vendorId', params.vendorId);
  if (params.projectId) q.set('projectId', params.projectId);
  if (params.purchaseOrderId) q.set('purchaseOrderId', params.purchaseOrderId);
  return apiClient.get<PaginatedResponse<TenantGoodsReceipt>>(`/goods-receipts?${q.toString()}`);
}

export async function fetchGoodsReceiptById(id: string): Promise<TenantGoodsReceipt> {
  return apiClient.get<TenantGoodsReceipt>(`/goods-receipts/${id}`);
}

export async function fetchPoReceiptContext(purchaseOrderId: string) {
  return apiClient.get<{
    purchaseOrderId: string;
    poNumber: string;
    vendorId: string;
    projectId?: string;
    status: string;
    lines: Array<{
      id: string;
      itemName?: string;
      description?: string;
      orderedQty: number;
      receivedQty: number;
      remainingQty: number;
      unitRate: number;
    }>;
  }>(`/goods-receipts/po-context/${purchaseOrderId}`);
}

export async function saveGoodsReceipt(body: Partial<TenantGoodsReceipt>): Promise<TenantGoodsReceipt> {
  if (body.id) {
    return apiClient.put<TenantGoodsReceipt>(`/goods-receipts/${body.id}`, body);
  }
  return apiClient.post<TenantGoodsReceipt>('/goods-receipts', body);
}

export async function postGoodsReceipt(id: string, version?: number): Promise<TenantGoodsReceipt> {
  return apiClient.post<TenantGoodsReceipt>(`/goods-receipts/${id}/post`, { version });
}

export async function closeGoodsReceipt(id: string, version?: number): Promise<TenantGoodsReceipt> {
  return apiClient.post<TenantGoodsReceipt>(`/goods-receipts/${id}/close`, { version });
}

export async function deleteGoodsReceipt(id: string): Promise<void> {
  await apiClient.delete(`/goods-receipts/${id}`);
}

export async function fetchGoodsReceiptReportSummary(): Promise<GoodsReceiptReportSummary> {
  return apiClient.get<GoodsReceiptReportSummary>('/goods-receipts/report/summary');
}
