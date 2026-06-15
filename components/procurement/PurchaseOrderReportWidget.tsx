import React from 'react';
import { usePurchaseOrderReport } from '../../hooks/usePurchaseOrders';
import { ChartCard, MetricCard } from '../analytics';
import { CURRENCY } from '../../constants';

const PurchaseOrderReportWidget: React.FC = () => {
  const { data, isLoading } = usePurchaseOrderReport();
  const summary = data ?? { byStatus: [], totals: { count: 0, totalAmount: 0, billedAmount: 0, openAmount: 0 }, openPurchaseOrders: [] };

  return (
    <ChartCard title="Purchase Order Summary">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total POs" value={summary.totals.count} />
        <MetricCard label="PO Value" value={summary.totals.totalAmount} />
        <MetricCard label="Billed" value={summary.totals.billedAmount} />
        <MetricCard label="Open Balance" value={summary.totals.openAmount} status="warning" />
      </div>

      {isLoading ? (
        <p className="text-sm text-app-muted">Loading report…</p>
      ) : (
        <>
          <h4 className="text-xs font-bold uppercase text-app-muted mb-2">By Status</h4>
          <ul className="space-y-1 text-sm mb-4">
            {summary.byStatus.map((row) => (
              <li key={row.status} className="flex justify-between">
                <span>{row.status}</span>
                <span>
                  {row.count} · {row.totalAmount.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })}
                </span>
              </li>
            ))}
          </ul>

          {summary.openPurchaseOrders.length > 0 && (
            <>
              <h4 className="text-xs font-bold uppercase text-app-muted mb-2">Open Purchase Orders</h4>
              <ul className="space-y-1 text-sm">
                {summary.openPurchaseOrders.slice(0, 8).map((po) => (
                  <li key={po.id} className="flex justify-between gap-2">
                    <span>
                      {po.poNumber} — {po.vendorName}
                    </span>
                    <span className="font-semibold whitespace-nowrap">
                      {po.remainingAmount.toLocaleString('en-US', { style: 'currency', currency: CURRENCY })} left
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </ChartCard>
  );
};

export default PurchaseOrderReportWidget;
