import React from 'react';
import { AlertTriangle, Banknote, HandCoins, Users, Wallet } from 'lucide-react';
import { MetricCard, MetricCardGridSkeleton } from '../../../components/analytics';

export interface ReportingKpi {
  id: string;
  label: string;
  value: number;
  format: 'currency' | 'count';
}

const DEFAULT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  totalCustomers: Users,
  totalTenants: Users,
  totalVendors: Users,
  outstandingReceivable: Wallet,
  outstandingPayable: Wallet,
  amountCollected: HandCoins,
  rentCollected: HandCoins,
  amountPaid: HandCoins,
  defaulterCustomers: AlertTriangle,
  defaulterTenants: AlertTriangle,
  overdueVendors: AlertTriangle,
  overdueInstallments: Banknote,
  overdueInvoices: Banknote,
  overdueBills: Banknote,
};

export const ReportingKpiStrip: React.FC<{
  kpis: ReportingKpi[] | undefined;
  loading?: boolean;
  iconMap?: Record<string, React.ComponentType<{ className?: string }>>;
}> = ({ kpis, loading, iconMap }) => {
  const icons = { ...DEFAULT_ICONS, ...iconMap };
  if (loading) return <MetricCardGridSkeleton count={5} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {(kpis ?? []).map((k) => {
        const Icon = icons[k.id] ?? Wallet;
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
