import React, { useEffect, useState } from 'react';
import Button from '../../ui/Button';
import {
  subscriptionBillingApi,
  type BillingPortalSummary,
} from '../../../services/api/subscriptionBillingApi';
import { PortalSpinner, paymentStatusStyle } from './BillingPortalShared';

const CancelSubscriptionPage: React.FC = () => {
  const [portal, setPortal] = useState<BillingPortalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void subscriptionBillingApi.getPortal().then(setPortal).catch(() => undefined).finally(() => setLoading(false));
  }, []);

  const cancelAtPeriodEnd = async () => {
    setCanceling(true);
    setError(null);
    try {
      await subscriptionBillingApi.cancel(true);
      setDone(true);
      setPortal(await subscriptionBillingApi.getPortal());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCanceling(false);
    }
  };

  const openPaddleCancel = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const { session } = await subscriptionBillingApi.createPortalSession();
      const url = session.cancelSubscriptionUrl ?? session.overviewUrl;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <PortalSpinner />;

  const canCancel =
    portal?.currentPlan &&
    !portal.cancelAtPeriodEnd &&
    portal.paymentStatus !== 'canceled';

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Cancel subscription</h2>
        <p className="text-sm text-slate-500 mt-1">
          Cancel at period end to keep access until your renewal date, or use Paddle portal for immediate cancellation.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}
      {done && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Cancellation scheduled. You retain access until the end of the billing period.
        </div>
      )}
      {portal?.cancelAtPeriodEnd && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your subscription is already scheduled to cancel at period end.
        </div>
      )}

      {portal?.currentPlan && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Plan</span>
            <span className="font-medium">{portal.currentPlan.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Payment status</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${paymentStatusStyle(portal.paymentStatus)}`}>
              {portal.paymentStatusLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Access until</span>
            <span className="font-medium">
              {portal.renewalDate ? new Date(portal.renewalDate).toLocaleDateString() : '—'}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {canCancel && (
          <Button variant="secondary" disabled={canceling} onClick={() => void cancelAtPeriodEnd()}>
            {canceling ? 'Processing…' : 'Cancel at period end'}
          </Button>
        )}
        <Button variant="secondary" disabled={portalLoading} onClick={() => void openPaddleCancel()}>
          Cancel via Paddle Portal
        </Button>
      </div>
    </div>
  );
};

export default CancelSubscriptionPage;
