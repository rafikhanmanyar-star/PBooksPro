import React, { useState } from 'react';
import PricingPage from './PricingPage';
import InvoiceHistory from './InvoiceHistory';
import CurrentSubscriptionPage from './portal/CurrentSubscriptionPage';
import BillingInformationPage from './portal/BillingInformationPage';
import UsageDashboardPage from './portal/UsageDashboardPage';
import UpgradePlanPage from './portal/UpgradePlanPage';
import CancelSubscriptionPage from './portal/CancelSubscriptionPage';
import ReactivateSubscriptionPage from './portal/ReactivateSubscriptionPage';
import { LEGAL_SLUGS, openLegalDocument } from '../legal/LegalMarkdown';
import ReferralDashboard from '../referrals/ReferralDashboard';

export type BillingPortalPage =
  | 'pricing'
  | 'subscription'
  | 'invoices'
  | 'information'
  | 'usage'
  | 'upgrade'
  | 'cancel'
  | 'reactivate'
  | 'referrals';

const NAV: { id: BillingPortalPage; label: string; group: string }[] = [
  { id: 'subscription', label: 'Current Subscription', group: 'Overview' },
  { id: 'usage', label: 'Usage Dashboard', group: 'Overview' },
  { id: 'pricing', label: 'Pricing', group: 'Plans' },
  { id: 'upgrade', label: 'Upgrade Plan', group: 'Plans' },
  { id: 'invoices', label: 'Invoice History', group: 'Billing' },
  { id: 'information', label: 'Billing Information', group: 'Billing' },
  { id: 'cancel', label: 'Cancel Subscription', group: 'Manage' },
  { id: 'reactivate', label: 'Reactivate Subscription', group: 'Manage' },
  { id: 'referrals', label: 'Referral Program', group: 'Rewards' },
];

const CustomerBillingPortal: React.FC = () => {
  const [page, setPage] = useState<BillingPortalPage>('subscription');

  const groups = [...new Set(NAV.map((n) => n.group))];

  return (
    <div className="flex flex-col gap-6 min-h-[480px]">
      <div className="flex flex-col lg:flex-row gap-6 flex-1">
      <aside className="lg:w-56 flex-shrink-0">
        <h1 className="text-lg font-bold text-slate-900 mb-4">Billing Portal</h1>
        <nav className="space-y-5">
          {groups.map((group) => (
            <div key={group}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {group}
              </p>
              <ul className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setPage(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                        page === item.id
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="flex-1 min-w-0">
        {page === 'pricing' && <PricingPage />}
        {page === 'subscription' && <CurrentSubscriptionPage />}
        {page === 'invoices' && <InvoiceHistory />}
        {page === 'information' && <BillingInformationPage />}
        {page === 'usage' && <UsageDashboardPage />}
        {page === 'upgrade' && <UpgradePlanPage />}
        {page === 'cancel' && <CancelSubscriptionPage />}
        {page === 'reactivate' && <ReactivateSubscriptionPage />}
        {page === 'referrals' && <ReferralDashboard />}
      </main>
      </div>

      <footer className="border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Legal</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
          {LEGAL_SLUGS.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                className="hover:text-indigo-600 hover:underline"
                onClick={() => openLegalDocument(item.slug)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  );
};

export default CustomerBillingPortal;
