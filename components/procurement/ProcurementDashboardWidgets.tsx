import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetricCard, ChartCard } from '../analytics';
import { fetchProcurementDashboardMetrics } from '../../services/quotationIntelligenceApi';
import { useFinancialReportAppState } from '../../hooks/useSelectiveState';
import { CURRENCY } from '../../constants';

function localMetrics(state: ReturnType<typeof useFinancialReportAppState>) {
  const now = new Date();
  const in7 = new Date(now);
  in7.setDate(in7.getDate() + 7);
  let active = 0;
  let expiring = 0;
  const rates: Array<{ vendorId: string; vendorName: string; rate: number }> = [];
  for (const q of state.quotations ?? []) {
    const st = q.status ?? (q.isActive ? 'Active' : 'Draft');
    if (st === 'Active' || st === 'Approved') active += 1;
    if (q.expiryDate) {
      const exp = new Date(`${q.expiryDate.slice(0, 10)}T12:00:00`);
      if (exp >= now && exp <= in7) expiring += 1;
    }
    for (const item of q.items ?? []) {
      if (item.pricePerQuantity > 0) {
        rates.push({ vendorId: q.vendorId, vendorName: q.name, rate: item.pricePerQuantity });
      }
    }
  }
  rates.sort((a, b) => a.rate - b.rate);
  return { activeQuotations: active, expiringQuotations: expiring, lowestVendorRates: rates.slice(0, 5), priceIncreaseAlerts: 0 };
}

const ProcurementDashboardWidgets: React.FC = () => {
  const state = useFinancialReportAppState();

  const { data, isLoading } = useQuery({
    queryKey: ['procurement-dashboard'],
    queryFn: async () => {
      return fetchProcurementDashboardMetrics();
      return localMetrics(state);
    },
    staleTime: 60_000,
  });

  const metrics = data ?? { activeQuotations: 0, expiringQuotations: 0, lowestVendorRates: [], priceIncreaseAlerts: 0 };

  return (
    <ChartCard title="Procurement Intelligence">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Active Quotations" value={metrics.activeQuotations} />
        <MetricCard label="Expiring (7 days)" value={metrics.expiringQuotations} status="warning" />
        <MetricCard label="Price Alerts" value={metrics.priceIncreaseAlerts} />
        <MetricCard label="Lowest Rates" value={metrics.lowestVendorRates.length} status="positive" />
      </div>
      {isLoading ? (
        <p className="text-sm text-app-muted">Loading...</p>
      ) : metrics.lowestVendorRates.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold uppercase text-app-muted mb-2">Lowest Vendor Rates</h4>
          <ul className="space-y-1 text-sm">
            {metrics.lowestVendorRates.map((r, i) => (
              <li key={`${r.vendorId}-${i}`} className="flex justify-between">
                <span>{r.vendorName}</span>
                <span className="font-semibold">
                  {r.rate.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-app-muted">No quotation rate data yet.</p>
      )}
    </ChartCard>
  );
};

export default ProcurementDashboardWidgets;
