import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetricCard, ChartCard } from '../analytics';
import { fetchProcurementDashboardMetrics } from '../../services/quotationIntelligenceApi';
import PurchaseOrderReportWidget from './PurchaseOrderReportWidget';
import { CURRENCY } from '../../constants';

const ProcurementDashboardWidgets: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['procurement-dashboard'],
    queryFn: () => fetchProcurementDashboardMetrics(),
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
      <div className="mt-6">
        <PurchaseOrderReportWidget />
      </div>
    </ChartCard>
  );
};

export default ProcurementDashboardWidgets;
