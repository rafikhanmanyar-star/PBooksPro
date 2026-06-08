import React, { useEffect, useState } from 'react';
import Button from '../../ui/Button';
import {
  subscriptionBillingApi,
  type BillingCustomer,
} from '../../../services/api/subscriptionBillingApi';
import { PortalSpinner } from './BillingPortalShared';

const BillingInformationPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [customer, setCustomer] = useState<BillingCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await subscriptionBillingApi.getBillingInformation();
        if (res.customer) {
          setCustomer(res.customer);
          setEmail(res.customer.email);
          setName(res.customer.name ?? '');
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load billing information');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await subscriptionBillingApi.updateBillingInformation(email.trim(), name.trim() || undefined);
      setCustomer(res.customer);
      setMessage('Billing information saved.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const openPortal = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      const { session } = await subscriptionBillingApi.createPortalSession();
      window.open(session.overviewUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not open portal');
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <PortalSpinner />;

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Billing information</h2>
        <p className="text-sm text-slate-500 mt-1">
          Contact details used for invoices and Paddle billing.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Billing email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Contact name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        {customer?.paddle_customer_id && (
          <p className="text-xs text-slate-500">Paddle customer ID: {customer.paddle_customer_id}</p>
        )}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button type="button" variant="secondary" disabled={portalLoading} onClick={() => void openPortal()}>
            Manage in Paddle Portal
          </Button>
        </div>
      </form>
    </div>
  );
};

export default BillingInformationPage;
