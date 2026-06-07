import React from 'react';
import type { PortalUsage } from '../../services/api/subscriptionBillingApi';

export function formatLimit(current: number, max: number): string {
  if (max < 0) return `${current} / ∞`;
  return `${current} / ${max}`;
}

export function barColor(percent: number): string {
  if (percent >= 95) return 'bg-rose-500';
  if (percent >= 80) return 'bg-amber-500';
  return 'bg-indigo-500';
}

type UsageMeterProps = {
  label: string;
  current: number;
  max: number;
  percent: number;
  unit?: string;
};

export const UsageMeter: React.FC<UsageMeterProps> = ({ label, current, max, percent, unit }) => (
  <div>
    <div className="flex justify-between text-sm text-slate-600 mb-1">
      <span>{label}</span>
      <span>
        {formatLimit(current, max)}
        {unit ? ` ${unit}` : ''}
      </span>
    </div>
    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${barColor(percent)}`}
        style={{ width: `${max < 0 ? 8 : Math.max(percent, 4)}%` }}
      />
    </div>
  </div>
);

export const UsageMeters: React.FC<{ usage: PortalUsage }> = ({ usage }) => (
  <div className="space-y-4">
    <UsageMeter
      label="Users"
      current={usage.usersCount}
      max={usage.maxUsers}
      percent={usage.usersPercent}
    />
    <UsageMeter
      label="Projects"
      current={usage.projectsCount}
      max={usage.maxProjects}
      percent={usage.projectsPercent}
    />
    <UsageMeter
      label="Storage"
      current={usage.storageGb}
      max={usage.maxStorageGb}
      percent={usage.storagePercent}
      unit="GB"
    />
  </div>
);

export const PortalSpinner: React.FC = () => (
  <div className="flex justify-center py-16">
    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

export const paymentStatusStyle = (status: string): string => {
  switch (status) {
    case 'valid':
      return 'bg-emerald-100 text-emerald-800';
    case 'trialing':
      return 'bg-blue-100 text-blue-800';
    case 'past_due':
      return 'bg-amber-100 text-amber-800';
    case 'canceled':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
};
