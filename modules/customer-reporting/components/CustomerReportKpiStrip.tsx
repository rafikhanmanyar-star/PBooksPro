import React from 'react';
import { AlertTriangle, Banknote, HandCoins, Users, Wallet } from 'lucide-react';
import { MetricCard, MetricCardGridSkeleton } from '../../../components/analytics';
import type { CustomerReportingKpi } from '../../../types/customerReporting.types';
const KPI_ICONS = {
  totalCustomers: Users,
  outstandingReceivable: Wallet,
  amountCollected: HandCoins,
  defaulterCustomers: AlertTriangle,
  overdueInstallments: Banknote,
} as const;

export const CustomerReportKpiStrip: React.FC<{
  kpis: CustomerReportingKpi[] | undefined;
  loading?: boolean;
}> = ({ kpis, loading }) => {
  if (loading) return <MetricCardGridSkeleton count={5} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {(kpis ?? []).map((k) => {
        const Icon = KPI_ICONS[k.id as keyof typeof KPI_ICONS] ?? Wallet;
        return (
          <MetricCard
            key={k.id}
            label={k.label}
            value={k.value}
            format={k.format === 'count' ? 'count' : 'currency'}
            icon={Icon}
          />
        );
      })}
    </div>
  );
};
