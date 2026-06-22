import React from 'react';
import { useBillingPortal } from '../../hooks/useBillingPortal';
import { usePermissions } from '../../hooks/usePermissions';
import { UsageMeters, paymentStatusStyle } from './portal/BillingPortalShared';

const SubscriptionStatusWidget: React.FC = () => {
  const { canAccessBillingPortal } = usePermissions();
  const { portal } = useBillingPortal();

  if (!canAccessBillingPortal || !portal) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-800">Subscription</h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${paymentStatusStyle(portal.paymentStatus)}`}
        >
          {portal.paymentStatusLabel}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500 text-xs">Current plan</p>
          <p className="font-medium text-slate-900">{portal.currentPlan?.name ?? 'No plan'}</p>
        </div>
        <div>
          <p className="text-slate-500 text-xs">Days remaining</p>
          <p className="font-medium text-slate-900">{portal.daysRemaining}</p>
        </div>
        <div className="col-span-2">
          <p className="text-slate-500 text-xs">Renewal date</p>
          <p className="font-medium text-slate-900">
            {portal.renewalDate ? new Date(portal.renewalDate).toLocaleDateString() : '—'}
          </p>
        </div>
      </div>

      {portal.usage && (
        <div className="mt-4">
          <UsageMeters usage={portal.usage} />
        </div>
      )}

      {portal.warnings.some((w) => w.severity === 'critical') && (
        <p className="mt-3 text-xs text-rose-600 font-medium">
          {portal.warnings.find((w) => w.severity === 'critical')?.message}
        </p>
      )}
    </div>
  );
};

export default SubscriptionStatusWidget;
