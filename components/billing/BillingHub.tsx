import React, { useState } from 'react';
import PricingPage from './PricingPage';
import SubscriptionDashboard from './SubscriptionDashboard';
import InvoiceHistory from './InvoiceHistory';
import SubscriptionWarningCenter from './SubscriptionWarningCenter';

type Tab = 'dashboard' | 'pricing' | 'invoices' | 'warnings';

const BillingHub: React.FC = () => {
  const [tab, setTab] = useState<Tab>('dashboard');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Subscription' },
    { id: 'warnings', label: 'Warnings' },
    { id: 'pricing', label: 'Plans & Pricing' },
    { id: 'invoices', label: 'Invoice History' },
  ];

  return (
    <div className="space-y-6">
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'dashboard' && <SubscriptionDashboard />}
      {tab === 'warnings' && <SubscriptionWarningCenter />}
      {tab === 'pricing' && <PricingPage />}
      {tab === 'invoices' && <InvoiceHistory />}
    </div>
  );
};

export default BillingHub;
