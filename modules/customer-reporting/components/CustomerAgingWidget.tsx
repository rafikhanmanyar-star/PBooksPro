import React, { useMemo } from 'react';
import { ChartCard, ColumnChart, CHART_COLORS } from '../../../components/analytics';
import type { CustomerAgingBucket } from '../../../types/customerReporting.types';
import { CURRENCY } from '../../../constants';

export const CustomerAgingWidget: React.FC<{
  aging: CustomerAgingBucket[] | undefined;
  loading?: boolean;
}> = ({ aging, loading }) => {
  const chartData = useMemo(
    () =>
      (aging ?? []).map((b) => ({
        name: b.label,
        Amount: b.amount,
      })),
    [aging]
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-app-border bg-app-card p-4 min-h-[280px] animate-pulse">
        <div className="h-4 w-40 bg-app-toolbar rounded mb-4" />
        <div className="h-48 bg-app-toolbar/60 rounded" />
      </div>
    );
  }

  return (
    <ChartCard title="Customer Aging" className="min-h-[280px]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-48 md:h-56">
          <ColumnChart
            data={chartData}
            series={[{ key: 'Amount', label: 'Outstanding', color: CHART_COLORS.neutral }]}
            height={220}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-app-border text-app-muted text-left">
                <th className="py-2 pr-2 font-semibold">Bucket</th>
                <th className="py-2 pr-2 font-semibold text-right">Amount</th>
                <th className="py-2 font-semibold text-right">Customers</th>
              </tr>
            </thead>
            <tbody>
              {(aging ?? []).map((b) => (
                <tr key={b.bucket} className="border-b border-app-border/50 text-app-text">
                  <td className="py-2 pr-2">{b.label}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">
                    {CURRENCY} {b.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="py-2 text-right tabular-nums">{b.customerCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ChartCard>
  );
};
