import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../ui/Button';
import {
  subscriptionBillingApi,
  type BillingPortalSummary,
} from '../../../services/api/subscriptionBillingApi';
import { PortalSpinner, UsageMeters, paymentStatusStyle } from './BillingPortalShared';

const CurrentSubscriptionPage: React.FC = () => {
  const [portal, setPortal] = useState<BillingPortalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPortal(await subscriptionBillingApi.getPortal());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPaddlePortal = async (target: 'overview' | 'payment') => {
    setPortalLoading(true);
    setError(null);
    try {
      const { session } = await subscriptionBillingApi.createPortalSession();
      const url =
        target === 'payment' && session.updatePaymentMethodUrl
          ? session.updatePaymentMethodUrl
          : session.overviewUrl;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open Paddle portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <PortalSpinner />;
  if (!portal) return null;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Current plan</h2>
            <p className="text-2xl font-bold text-slate-900 mt-2">
              {portal.currentPlan?.name ?? 'No active plan'}
            </p>
            {portal.currentPlan && (
              <p className="text-sm text-slate-500 capitalize mt-1">
                {portal.currentPlan.billingCycle} · {portal.currentPlan.code}
              </p>
            )}
          </div>
          <span
            className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${paymentStatusStyle(portal.paymentStatus)}`}
          >
            {portal.paymentStatusLabel}
          </span>
        </div>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <dt className="text-slate-500">Renewal date</dt>
            <dd className="font-medium text-slate-900 mt-0.5">
              {portal.renewalDate
                ? new Date(portal.renewalDate).toLocaleDateString()
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Days remaining</dt>
            <dd className="font-medium text-slate-900 mt-0.5">{portal.daysRemaining}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Subscription status</dt>
            <dd className="font-medium text-slate-900 capitalize mt-0.5">
              {portal.currentPlan?.status?.replace(/_/g, ' ') ?? '—'}
            </dd>
          </div>
        </dl>

        {portal.cancelAtPeriodEnd && (
          <p className="mt-4 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            Cancellation scheduled at end of billing period.
          </p>
        )}
      </div>

      {portal.usage && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">Resource usage</h3>
          <UsageMeters usage={portal.usage} />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button disabled={portalLoading} onClick={() => void openPaddlePortal('overview')}>
          {portalLoading ? 'Opening…' : 'Open Paddle Customer Portal'}
        </Button>
        {portal.paddleSubscriptionId && (
          <Button
            variant="secondary"
            disabled={portalLoading}
            onClick={() => void openPaddlePortal('payment')}
          >
            Update payment method
          </Button>
        )}
      </div>
    </div>
  );
};

export default CurrentSubscriptionPage;
