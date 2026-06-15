import { useCallback } from 'react';
import { useFinancialReportAppState } from './useSelectiveState';
import type { QuotationItemRateLookup } from '../types';
import { fetchQuotationItemRates } from '../services/quotationIntelligenceApi';

function localRateLookup(
  state: ReturnType<typeof useFinancialReportAppState>,
  vendorId: string,
  categoryId: string,
  itemName?: string
): QuotationItemRateLookup {
  const quotations = state.quotations ?? [];
  const vendorQuotes = quotations.filter((q) => q.vendorId === vendorId);
  let lastPurchase: number | undefined;
  for (const q of vendorQuotes.sort((a, b) => b.date.localeCompare(a.date))) {
    for (const item of q.items ?? []) {
      if (item.categoryId !== categoryId) continue;
      if (itemName && item.itemName?.toLowerCase() !== itemName.toLowerCase()) continue;
      if (item.pricePerQuantity > 0) {
        lastPurchase = item.pricePerQuantity;
        break;
      }
    }
    if (lastPurchase) break;
  }

  let lastContract: number | undefined;
  for (const c of (state.contracts ?? []).filter((c) => c.vendorId === vendorId)) {
    for (const item of c.expenseCategoryItems ?? []) {
      if (item.categoryId === categoryId && item.pricePerUnit > 0) {
        lastContract = item.pricePerUnit;
        break;
      }
    }
    if (lastContract) break;
  }

  let lastBill: number | undefined;
  for (const b of (state.bills ?? []).filter((b) => b.vendorId === vendorId)) {
    for (const item of b.expenseCategoryItems ?? []) {
      if (item.categoryId === categoryId && item.pricePerUnit > 0) {
        lastBill = item.pricePerUnit;
        break;
      }
    }
    if (lastBill) break;
  }

  const marketRates: number[] = [];
  for (const q of quotations) {
    for (const item of q.items ?? []) {
      if (item.categoryId !== categoryId) continue;
      if (itemName && item.itemName?.toLowerCase() !== itemName.toLowerCase()) continue;
      if (item.pricePerQuantity > 0) marketRates.push(item.pricePerQuantity);
    }
  }
  const averageMarketRate =
    marketRates.length > 0
      ? Math.round((marketRates.reduce((s, r) => s + r, 0) / marketRates.length) * 100) / 100
      : undefined;

  const previousRate = lastPurchase ?? lastContract ?? lastBill;
  return {
    lastPurchaseRate: lastPurchase,
    lastContractRate: lastContract,
    lastBillRate: lastBill,
    averageMarketRate,
    previousRate,
  };
}

export function useQuotationItemRates(vendorId: string) {
  const state = useFinancialReportAppState();

  const lookupRates = useCallback(
    async (categoryId: string, itemName?: string): Promise<QuotationItemRateLookup> => {
      if (!vendorId || !categoryId) return {};
      try {
        return await fetchQuotationItemRates({ vendorId, categoryId, itemName });
      } catch {
        return localRateLookup(state, vendorId, categoryId, itemName);
      }
    },
    [state, vendorId]
  );

  return { lookupRates };
}

export function computeVariancePercent(quotedRate: number, previousRate?: number): number | undefined {
  if (!previousRate || previousRate <= 0) return undefined;
  return Math.round(((quotedRate - previousRate) / previousRate) * 10000) / 100;
}

export function varianceSeverity(
  variancePercent: number | undefined,
  threshold = 5
): 'green' | 'yellow' | 'red' | 'none' {
  if (variancePercent == null) return 'none';
  if (variancePercent <= 0) return 'green';
  if (variancePercent <= 3) return 'green';
  if (variancePercent <= threshold) return 'yellow';
  return 'red';
}
