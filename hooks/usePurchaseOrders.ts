import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeSocket } from '../core/socket';
import { useAuth } from '../context/AuthContext';
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  deletePurchaseOrder,
  fetchPurchaseOrderReportSummary,
  fetchPurchaseOrders,
  savePurchaseOrder,
  submitPurchaseOrder,
} from '../services/purchaseOrdersApi';
import type { TenantPurchaseOrder } from '../types';

export function usePurchaseOrders(filters?: {
  status?: string;
  vendorId?: string;
  projectId?: string;
}) {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket || !tenantId) return;
    const onEntity = (payload: { tenantId?: string; type?: string }) => {
      if (payload.tenantId && payload.tenantId !== tenantId) return;
      if (payload.type === 'purchase_order' || payload.type === 'bill') {
        void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        void queryClient.invalidateQueries({ queryKey: ['purchase-order-report'] });
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
    queryKey: ['purchase-orders', filters],
    queryFn: () => fetchPurchaseOrders(filters),
    staleTime: 30_000,
  });
}

export function usePurchaseOrderReport() {
  return useQuery({
    queryKey: ['purchase-order-report'],
    queryFn: fetchPurchaseOrderReportSummary,
    staleTime: 60_000,
  });
}

export function usePurchaseOrderMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-order-report'] });
    void queryClient.invalidateQueries({ queryKey: ['bills'] });
  };

  const save = useMutation({
    mutationFn: (body: Partial<TenantPurchaseOrder>) => savePurchaseOrder(body),
    onSuccess: invalidate,
  });

  const submit = useMutation({
    mutationFn: (input: { id: string; version?: number }) =>
      submitPurchaseOrder(input.id, input.version),
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: (input: { id: string; version?: number }) =>
      approvePurchaseOrder(input.id, input.version),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (input: { id: string; reason?: string; version?: number }) =>
      cancelPurchaseOrder(input.id, input.reason, input.version),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (input: { id: string; version?: number }) =>
      deletePurchaseOrder(input.id, input.version),
    onSuccess: invalidate,
  });

  return { save, submit, approve, cancel, remove };
}
