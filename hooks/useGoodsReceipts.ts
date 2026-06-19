import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeGoodsReceipt,
  deleteGoodsReceipt,
  fetchGoodsReceiptReportSummary,
  fetchGoodsReceipts,
  postGoodsReceipt,
  saveGoodsReceipt,
} from '../services/goodsReceiptsApi';
import type { TenantGoodsReceipt } from '../types';

export function useGoodsReceipts(filters?: {
  status?: string;
  vendorId?: string;
  projectId?: string;
  purchaseOrderId?: string;
}) {
  return useQuery({
    queryKey: ['goods-receipts', filters],
    queryFn: () => fetchGoodsReceipts(filters),
    staleTime: 30_000,
  });
}

export function useGoodsReceiptReport() {
  return useQuery({
    queryKey: ['goods-receipt-report'],
    queryFn: fetchGoodsReceiptReportSummary,
    staleTime: 60_000,
  });
}

export function useGoodsReceiptMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
    void queryClient.invalidateQueries({ queryKey: ['goods-receipt-report'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  };

  const save = useMutation({
    mutationFn: (body: Partial<TenantGoodsReceipt>) => saveGoodsReceipt(body),
    onSuccess: invalidate,
  });

  const post = useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => postGoodsReceipt(id, version),
    onSuccess: invalidate,
  });

  const close = useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => closeGoodsReceipt(id, version),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteGoodsReceipt(id),
    onSuccess: invalidate,
  });

  return { save, post, close, remove };
}
