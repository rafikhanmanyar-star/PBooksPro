import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetricCard, ChartCard } from '../analytics';
import { apiClient } from '../../services/api/client';
import { isLocalOnlyMode } from '../../config/apiUrl';
import type { QuotationComplianceMetrics } from '../../shared/quotation-validation/types';
import Input from '../ui/Input';
import Button from '../ui/Button';

const emptyMetrics: QuotationComplianceMetrics = {
  purchasesWithinQuotation: 0,
  purchasesAboveQuotation: 0,
  totalVarianceAmount: 0,
  savingsAchieved: 0,
  topVendorsByVariance: [],
};

async function fetchCompliance(params: Record<string, string>): Promise<QuotationComplianceMetrics> {
  const qs = new URLSearchParams(params).toString();
  return apiClient.get<QuotationComplianceMetrics>(
    `/quotation-validation/compliance${qs ? `?${qs}` : ''}`
  );
}

const VendorQuotationComplianceWidget: React.FC = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [vendorId, setVendorId] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['quotation-compliance', dateFrom, dateTo, vendorId],
    queryFn: () =>
      fetchCompliance({
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
        ...(vendorId ? { vendorId } : {}),
      }),
    enabled: !isLocalOnlyMode(),
    staleTime: 60_000,
  });

  const metrics = data ?? emptyMetrics;

  if (isLocalOnlyMode()) {
    return (
      <ChartCard title="Vendor Quotation Compliance">
        <p className="text-sm text-app-muted p-4">
          Compliance analytics require API mode with PostgreSQL override audit data.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Vendor Quotation Compliance"
      headerRight={
        <Button variant="secondary" className="text-xs h-8" onClick={() => refetch()} disabled={isFetching}>
          Refresh
        </Button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Within Quotation" value={metrics.purchasesWithinQuotation} />
        <MetricCard label="Above Quotation" value={metrics.purchasesAboveQuotation} status="warning" />
        <MetricCard label="Total Variance" value={metrics.totalVarianceAmount} status="negative" />
        <MetricCard label="Savings Achieved" value={metrics.savingsAchieved} status="positive" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        <Input label="From" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <Input label="To" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <Input label="Vendor ID" value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="Optional" />
      </div>

      {metrics.topVendorsByVariance.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase text-app-muted mb-2">Top Vendors by Variance</h4>
          <ul className="space-y-1 text-sm">
            {metrics.topVendorsByVariance.map((v) => (
              <li key={v.vendorId} className="flex justify-between gap-2 border-b border-app-border py-1">
                <span className="truncate">{v.vendorName ?? v.vendorId}</span>
                <span className="font-medium text-rose-600 dark:text-rose-400 shrink-0">
                  {v.varianceAmount.toLocaleString('en-US', { style: 'currency', currency: 'PKR' })}
                  <span className="text-app-muted font-normal ml-1">({v.overrideCount})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
};

export default VendorQuotationComplianceWidget;
