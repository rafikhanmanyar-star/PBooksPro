import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  subscriptionBillingApi,
  type Subscription,
} from '../../services/api/subscriptionBillingApi';

const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  trialing: 'bg-blue-100 text-blue-800',
  past_due: 'bg-amber-100 text-amber-800',
  canceled: 'bg-rose-100 text-rose-800',
  expired: 'bg-slate-100 text-slate-700',
};

const SubscriptionDashboard: React.FC = () => {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [license, setLicense] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await subscriptionBillingApi.getSubscription();
      setSubscription(res.subscription);
      setLicense((res.license as Record<string, unknown>) ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setActionLoading(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const status = subscription?.status ?? 'none';
  const badgeClass = statusColors[status] ?? 'bg-slate-100 text-slate-700';

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
            <h2 className="text-lg font-semibold text-slate-800">Current subscription</h2>
            {subscription ? (
              <>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {subscription.plan_name ?? subscription.plan_code}
                </p>
                <p className="text-sm text-slate-500 capitalize mt-1">
                  {subscription.billing_cycle} billing
                </p>
              </>
            ) : (
              <p className="text-slate-500 mt-2">No active subscription</p>
            )}
          </div>
          <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium capitalize ${badgeClass}`}>
            {status.replace(/_/g, ' ')}
          </span>
        </div>

        {subscription && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-slate-500">Started</dt>
              <dd className="font-medium text-slate-800">
                {new Date(subscription.start_date).toLocaleDateString()}
              </dd>
            </div>
            {subscription.trial_end_date && (
              <div>
                <dt className="text-slate-500">Trial ends</dt>
                <dd className="font-medium text-slate-800">
                  {new Date(subscription.trial_end_date).toLocaleDateString()}
                </dd>
              </div>
            )}
            {subscription.renewal_date && (
              <div>
                <dt className="text-slate-500">Next renewal</dt>
                <dd className="font-medium text-slate-800">
                  {new Date(subscription.renewal_date).toLocaleDateString()}
                </dd>
              </div>
            )}
            {subscription.cancel_at_period_end && (
              <div className="sm:col-span-2">
                <p className="text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Cancellation scheduled at end of billing period.
                </p>
              </div>
            )}
          </dl>
        )}

        {license && (
          <div className="mt-4 pt-4 border-t border-slate-100 text-sm text-slate-600">
            License:{' '}
            <span className="font-medium capitalize">
              {String(license.licenseStatus ?? license.license_status ?? 'unknown')}
            </span>
            {license.daysRemaining != null && (
              <span className="ml-2">· {String(license.daysRemaining)} days remaining</span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {subscription &&
          !subscription.cancel_at_period_end &&
          subscription.status !== 'canceled' && (
            <Button
              variant="secondary"
              disabled={!!actionLoading}
              onClick={() =>
                void runAction('cancel', () => subscriptionBillingApi.cancel(true))
              }
            >
              {actionLoading === 'cancel' ? 'Processing…' : 'Cancel at period end'}
            </Button>
          )}
        {(subscription?.cancel_at_period_end || subscription?.status === 'canceled') && (
          <Button
            disabled={!!actionLoading}
            onClick={() =>
              void runAction('reactivate', () => subscriptionBillingApi.reactivate())
            }
          >
            {actionLoading === 'reactivate' ? 'Processing…' : 'Reactivate subscription'}
          </Button>
        )}
      </div>
    </div>
  );
};

export default SubscriptionDashboard;
