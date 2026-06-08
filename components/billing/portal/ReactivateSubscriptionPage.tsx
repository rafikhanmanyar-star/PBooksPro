import React, { useEffect, useState } from 'react';
import Button from '../../ui/Button';
import {
  subscriptionBillingApi,
  type BillingPortalSummary,
} from '../../../services/api/subscriptionBillingApi';
import { PortalSpinner, paymentStatusStyle } from './BillingPortalShared';

const ReactivateSubscriptionPage: React.FC = () => {
  const [portal, setPortal] = useState<BillingPortalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [reactivating, setReactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void subscriptionBillingApi.getPortal().then(setPortal).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  const reactivate = async () => {
    setReactivating(true);
    setError(null);
    try {
      await subscriptionBillingApi.reactivate();
      setDone(true);
      setPortal(await subscriptionBillingApi.getPortal());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reactivation failed');
    } finally {
      setReactivating(false);
    }
  };

  if (loading) return <PortalSpinner />;

  const needsReactivation =
    portal?.cancelAtPeriodEnd ||
    portal?.paymentStatus === 'canceled' ||
    portal?.currentPlan?.status === 'canceled';

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Reactivate subscription</h2>
        <p className="text-sm text-slate-500 mt-1">
          Resume your subscription if you previously scheduled cancellation or your plan was canceled.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {done && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Subscription reactivated successfully.
        </div>
      )}

      {portal?.currentPlan ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Plan</span>
            <span className="font-medium">{portal.currentPlan.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Status</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${paymentStatusStyle(portal.paymentStatus)}`}>
              {portal.paymentStatusLabel}
            </span>
          </div>
          {portal.cancelAtPeriodEnd && (
            <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              Cancellation is scheduled — reactivate to keep your subscription.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-slate-500">
          No subscription found. Visit Pricing to subscribe.
        </div>
      )}

      {needsReactivation && (
        <Button disabled={reactivating} onClick={() => void reactivate()}>
          {reactivating ? 'Processing…' : 'Reactivate subscription'}
        </Button>
      )}

      {!needsReactivation && portal?.currentPlan && (
        <p className="text-sm text-emerald-700">Your subscription is already active.</p>
      )}
    </div>
  );
};

export default ReactivateSubscriptionPage;
