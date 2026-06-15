import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeSocket } from '../core/socket';
import { useAuth } from '../context/AuthContext';
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
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket || !tenantId) return;
    const onEntity = (payload: { tenantId?: string; type?: string }) => {
      if (payload.tenantId && payload.tenantId !== tenantId) return;
      if (payload.type === 'goods_receipt' || payload.type === 'purchase_order') {
        void queryClient.invalidateQueries({ queryKey: ['goods-receipts'] });
        void queryClient.invalidateQueries({ queryKey: ['goods-receipt-report'] });
        void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      }
    };
    socket.on('entity_updated', onEntity);
    socket.on('entity_created', onEntity);
    socket.on('entity_deleted', onEntity);
    return () => {
      socket.off('entity_updated', onEntity);
      socket.off('entity_created', onEntity);
      socket.off('entity_deleted', onEntity);
    };
  }, [tenantId, queryClient]);

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
