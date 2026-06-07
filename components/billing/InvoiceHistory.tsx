import React, { useEffect, useState } from 'react';
import {
  subscriptionBillingApi,
  type SubscriptionInvoice,
} from '../../services/api/subscriptionBillingApi';

const statusStyles: Record<string, string> = {
  paid: 'text-emerald-700 bg-emerald-50',
  open: 'text-amber-700 bg-amber-50',
  draft: 'text-slate-600 bg-slate-50',
  void: 'text-slate-500 bg-slate-50',
  uncollectible: 'text-rose-700 bg-rose-50',
};

const InvoiceHistory: React.FC = () => {
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await subscriptionBillingApi.listInvoices();
        setInvoices(res.items);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load invoices');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
        No invoices yet. Invoices appear here after your first payment.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
              Invoice
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
              Amount
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-slate-50/50">
              <td className="px-4 py-3 text-sm font-medium text-slate-800">
                {inv.invoice_number}
              </td>
              <td className="px-4 py-3 text-sm text-slate-600">
                {new Date(inv.invoice_date).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-sm text-slate-800">
                {inv.currency} {Number(inv.amount).toFixed(2)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize ${
                    statusStyles[inv.status] ?? 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {inv.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default InvoiceHistory;
