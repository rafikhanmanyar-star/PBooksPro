import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getRealtimeSocket } from '../core/socket';
import { useAuth } from '../context/AuthContext';
import {
  approveVendorQuotation,
  convertQuotationToPurchaseOrder,
  createQuotationComparisonSession,
  fetchProcurementQuotationComparison,
  markPreferredQuotation,
} from '../services/procurementComparisonApi';
import type { QuotationComparisonSession } from '../types';

export type QuotationComparisonFilters = {
  projectId?: string;
  buildingId?: string;
  packageName?: string;
  categoryId?: string;
  itemName?: string;
};

export function useQuotationComparison(filters: QuotationComparisonFilters) {
  const queryClient = useQueryClient();
  const { tenantId } = useAuth();

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket || !tenantId) return;
    const onEntity = (payload: { tenantId?: string; type?: string }) => {
      if (payload.tenantId && payload.tenantId !== tenantId) return;
      if (
        payload.type === 'quotation' ||
        payload.type === 'vendor' ||
        payload.type === 'purchase_order'
      ) {
        void queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
        void queryClient.invalidateQueries({ queryKey: ['procurement-dashboard'] });
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
    queryKey: ['quotation-comparison', filters],
    queryFn: () => fetchProcurementQuotationComparison(filters),
    staleTime: 30_000,
  });
}

export function useQuotationComparisonWorkflow() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['quotation-comparison'] });
    void queryClient.invalidateQueries({ queryKey: ['quotations'] });
    void queryClient.invalidateQueries({ queryKey: ['procurement-dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  };

  const createSession = useMutation({
    mutationFn: createQuotationComparisonSession,
    onSuccess: invalidate,
  });

  const prefer = useMutation({
    mutationFn: (input: { sessionId: string; quotationId: string; version?: number }) =>
      markPreferredQuotation(input.sessionId, input.quotationId, input.version),
    onSuccess: invalidate,
  });

  const approve = useMutation({
    mutationFn: (input: { quotationId: string; sessionId?: string; version?: number }) =>
      approveVendorQuotation(input.quotationId, {
        sessionId: input.sessionId,
        version: input.version,
      }),
    onSuccess: invalidate,
  });

  const convertToPo = useMutation({
    mutationFn: (input: {
      quotationId: string;
      sessionId?: string;
      targetDeliveryDate?: string;
      description?: string;
    }) =>
      convertQuotationToPurchaseOrder(input.quotationId, {
        sessionId: input.sessionId,
        targetDeliveryDate: input.targetDeliveryDate,
        description: input.description,
      }),
    onSuccess: invalidate,
  });

  return { createSession, prefer, approve, convertToPo };
}

export type { QuotationComparisonSession };
