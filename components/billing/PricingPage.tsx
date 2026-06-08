import React, { useCallback, useEffect, useState } from 'react';
import Button from '../ui/Button';
import {
  subscriptionBillingApi,
  type BillingPlan,
} from '../../services/api/subscriptionBillingApi';
import LegalAcceptanceCheckbox from '../legal/LegalAcceptanceCheckbox';
import type { LegalAcceptanceInput } from '../../services/api/legalApi';
import { navigateToAppPath } from '../../utils/appNavigation';

type BillingCycle = 'monthly' | 'annual';

const PricingPage: React.FC = () => {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalAcceptances, setLegalAcceptances] = useState<LegalAcceptanceInput[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await subscriptionBillingApi.listPlans();
        setPlans(res.items.filter((p) => p.plan_code !== 'trial' && p.is_active));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load plans');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSelectPlan = useCallback(
    async (planCode: string) => {
      if (!legalAccepted || legalAcceptances.length === 0) {
        setError('You must accept the Subscription Agreement and Refund Policy before checkout.');
        return;
      }
      setCheckingOut(planCode);
      setError(null);
      try {
        const { checkout } = await subscriptionBillingApi.checkout(planCode, cycle, {
          legalAcceptances,
        });
        const url = checkout.checkoutUrl;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          window.location.href = url;
        } else {
          navigateToAppPath(url);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Checkout failed');
        setCheckingOut(null);
      }
    },
    [cycle, legalAccepted, legalAcceptances]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Choose your plan</h2>
          <p className="text-sm text-slate-500 mt-1">
            Secure billing powered by Paddle. Switch or cancel anytime.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              cycle === 'monthly' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'
            }`}
            onClick={() => setCycle('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`px-4 py-2 text-sm font-medium rounded-md transition ${
              cycle === 'annual' ? 'bg-white shadow text-indigo-600' : 'text-slate-600'
            }`}
            onClick={() => setCycle('annual')}
          >
            Annual
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <LegalAcceptanceCheckbox
        context="checkout"
        checked={legalAccepted}
        disabled={checkingOut !== null}
        onChange={(checked, acceptances) => {
          setLegalAccepted(checked);
          setLegalAcceptances(acceptances);
        }}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const price =
            cycle === 'annual' ? Number(plan.annual_price) : Number(plan.monthly_price);
          const modules = Array.isArray(plan.features_json?.modules)
            ? (plan.features_json.modules as string[])
            : [];

          return (
            <div
              key={plan.id}
              className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition"
            >
              <h3 className="text-lg font-semibold text-slate-800">{plan.name}</h3>
              <p className="text-sm text-slate-500 mt-1 min-h-[40px]">{plan.description}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">${price.toFixed(0)}</span>
                <span className="text-slate-500 text-sm ml-1">
                  /{cycle === 'annual' ? 'year' : 'month'}
                </span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                <li>Up to {plan.max_users < 0 ? 'unlimited' : plan.max_users} users</li>
                <li>
                  Up to {plan.max_projects < 0 ? 'unlimited' : plan.max_projects} projects
                </li>
                <li>{plan.max_storage_gb} GB storage</li>
                {modules.slice(0, 3).map((m) => (
                  <li key={m} className="capitalize">
                    {m.replace(/_/g, ' ')} module
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-6"
                disabled={checkingOut === plan.plan_code || !legalAccepted}
                onClick={() => void handleSelectPlan(plan.plan_code)}
              >
                {checkingOut === plan.plan_code ? 'Starting checkout…' : 'Subscribe'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingPage;
