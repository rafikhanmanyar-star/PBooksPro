import React, { useCallback, useEffect, useState } from 'react';
import Button from '../../ui/Button';
import {
  subscriptionBillingApi,
  type BillingPlan,
} from '../../../services/api/subscriptionBillingApi';
import { PortalSpinner } from './BillingPortalShared';
import LegalAcceptanceCheckbox from '../../legal/LegalAcceptanceCheckbox';
import type { LegalAcceptanceInput } from '../../../services/api/legalApi';
import { navigateToAppPath } from '../../../utils/appNavigation';

type BillingCycle = 'monthly' | 'annual';

const UpgradePlanPage: React.FC = () => {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [currentPlanCode, setCurrentPlanCode] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalAcceptances, setLegalAcceptances] = useState<LegalAcceptanceInput[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [plansRes, portal, subRes] = await Promise.all([
          subscriptionBillingApi.listPlans(),
          subscriptionBillingApi.getPortal(),
          subscriptionBillingApi.getSubscription(),
        ]);
        setPlans(plansRes.items.filter((p) => p.plan_code !== 'trial' && p.is_active));
        setCurrentPlanCode(portal.currentPlan?.code ?? null);
        setSubscriptionStatus(subRes.subscription?.status ?? null);
        if (portal.currentPlan?.billingCycle === 'annual') setCycle('annual');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load plans');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUpgrade = useCallback(
    async (planCode: string) => {
      if (planCode === currentPlanCode) return;
      setUpgrading(planCode);
      setError(null);
      setSuccess(null);
      try {
        const sub = await subscriptionBillingApi.getSubscription();
        if (sub.subscription && sub.subscription.status !== 'trialing') {
          await subscriptionBillingApi.changePlan(planCode, { billingCycle: cycle });
          setSuccess(`Plan changed to ${planCode}.`);
          setCurrentPlanCode(planCode);
        } else {
          if (!legalAccepted || legalAcceptances.length === 0) {
            setError('You must accept the Subscription Agreement and Refund Policy before checkout.');
            setUpgrading(null);
            return;
          }
          const { checkout } = await subscriptionBillingApi.checkout(planCode, cycle, {
            legalAcceptances,
          });
          const url = checkout.checkoutUrl;
          if (url.startsWith('http://') || url.startsWith('https://')) {
            window.location.href = url;
          } else {
            navigateToAppPath(url);
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Upgrade failed');
        setUpgrading(null);
      }
    },
    [currentPlanCode, cycle, legalAccepted, legalAcceptances]
  );

  if (loading) return <PortalSpinner />;

  const checkoutLegalRequired =
    !subscriptionStatus || subscriptionStatus === 'trialing';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Upgrade plan</h2>
          <p className="text-sm text-slate-500 mt-1">
            {currentPlanCode
              ? `You are on ${currentPlanCode}. Select a higher tier or switch billing cycle.`
              : 'Choose a plan to subscribe.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
          {(['monthly', 'annual'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                cycle === c ? 'bg-white shadow text-indigo-600' : 'text-slate-600'
              }`}
              onClick={() => setCycle(c)}
            >
              {c === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {checkoutLegalRequired && (
        <LegalAcceptanceCheckbox
          context="checkout"
          checked={legalAccepted}
          disabled={upgrading !== null}
          onChange={(checked, acceptances) => {
            setLegalAccepted(checked);
            setLegalAcceptances(acceptances);
          }}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const price = cycle === 'annual' ? Number(plan.annual_price) : Number(plan.monthly_price);
          const isCurrent = plan.plan_code === currentPlanCode;
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-6 shadow-sm ${
                isCurrent ? 'border-indigo-400 ring-2 ring-indigo-100 bg-indigo-50/30' : 'border-slate-200 bg-white'
              }`}
            >
              {isCurrent && (
                <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">
                  Current plan
                </span>
              )}
              <h3 className="text-lg font-semibold text-slate-800 mt-1">{plan.name}</h3>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                ${price.toFixed(0)}
                <span className="text-sm font-normal text-slate-500">
                  /{cycle === 'annual' ? 'yr' : 'mo'}
                </span>
              </p>
              <ul className="mt-3 text-sm text-slate-600 space-y-1">
                <li>{plan.max_users < 0 ? 'Unlimited' : plan.max_users} users</li>
                <li>{plan.max_projects < 0 ? 'Unlimited' : plan.max_projects} projects</li>
              </ul>
              <Button
                className="w-full mt-4"
                variant={isCurrent ? 'secondary' : 'primary'}
                disabled={
                  isCurrent ||
                  upgrading === plan.plan_code ||
                  (checkoutLegalRequired && !isCurrent && !legalAccepted)
                }
                onClick={() => void handleUpgrade(plan.plan_code)}
              >
                {isCurrent ? 'Current plan' : upgrading === plan.plan_code ? 'Processing…' : 'Select plan'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default UpgradePlanPage;
