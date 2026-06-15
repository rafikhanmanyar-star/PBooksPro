import React from 'react';
import { useGoodsReceiptReport } from '../../hooks/useGoodsReceipts';
import { CURRENCY } from '../../constants';

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: CURRENCY });
}

const GoodsReceiptReportWidget: React.FC = () => {
  const { data, isLoading } = useGoodsReceiptReport();

  if (isLoading) {
    return <p className="text-sm text-app-muted">Loading GRN reports…</p>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="font-bold text-app-text mb-2">GRN Status</h4>
        <div className="flex flex-wrap gap-3">
          {data.grnByStatus.map((s) => (
            <div key={s.status} className="rounded-lg border border-app-border px-3 py-2 text-sm">
              <span className="text-app-muted">{s.status}: </span>
              <span className="font-semibold">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-bold text-app-text mb-2">Pending Receipts</h4>
        {data.pendingReceipts.length === 0 ? (
          <p className="text-sm text-app-muted">All approved PO lines are fully received.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-app-border">
            <table className="min-w-full text-sm">
              <thead className="bg-app-bg text-app-muted text-left">
                <tr>
                  <th className="px-3 py-2">PO</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2 text-right">Remaining Qty</th>
                  <th className="px-3 py-2 text-right">Remaining Value</th>
                </tr>
              </thead>
              <tbody>
                {data.pendingReceipts.slice(0, 10).map((r) => (
                  <tr key={r.purchaseOrderId} className="border-t border-app-border">
                    <td className="px-3 py-2">{r.poNumber}</td>
                    <td className="px-3 py-2">{r.vendorName}</td>
                    <td className="px-3 py-2 text-right">{r.remainingQty}</td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(Math.max(0, r.orderedValue - r.receivedValue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h4 className="font-bold text-app-text mb-2">PO vs Received</h4>
        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="min-w-full text-sm">
            <thead className="bg-app-bg text-app-muted text-left">
              <tr>
                <th className="px-3 py-2">PO</th>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2 text-right">Ordered</th>
                <th className="px-3 py-2 text-right">Received</th>
                <th className="px-3 py-2 text-right">Billed</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {data.poVsReceived.slice(0, 10).map((r) => (
                <tr key={r.purchaseOrderId} className="border-t border-app-border">
                  <td className="px-3 py-2">{r.poNumber}</td>
                  <td className="px-3 py-2">{r.vendorName}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.totalAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.receivedAmount)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(r.billedAmount)}</td>
                  <td className="px-3 py-2 text-right">{r.receivePercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h4 className="font-bold text-app-text mb-2">Vendor Performance</h4>
        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="min-w-full text-sm">
            <thead className="bg-app-bg text-app-muted text-left">
              <tr>
                <th className="px-3 py-2">Vendor</th>
                <th className="px-3 py-2 text-right">GRNs</th>
                <th className="px-3 py-2 text-right">Received Value</th>
                <th className="px-3 py-2 text-right">Avg Days</th>
              </tr>
            </thead>
            <tbody>
              {data.vendorPerformance.slice(0, 10).map((v) => (
                <tr key={v.vendorId} className="border-t border-app-border">
                  <td className="px-3 py-2">{v.vendorName}</td>
                  <td className="px-3 py-2 text-right">{v.grnCount}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(v.totalReceivedValue)}</td>
                  <td className="px-3 py-2 text-right">{v.avgDaysToReceive}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GoodsReceiptReportWidget;
