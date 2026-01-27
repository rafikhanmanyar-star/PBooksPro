import React, { useState, useEffect } from 'react';
import { paymentsApi, PaymentRecord } from '../../services/api/payments';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface PaymentHistoryProps {
  onClose?: () => void;
}

const PaymentHistory: React.FC<PaymentHistoryProps> = ({ onClose }) => {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPaymentHistory();
  }, []);

  const loadPaymentHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const history = await paymentsApi.getPaymentHistory();
      setPayments(history);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment history');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number, currency: string) => {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center py-8">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">Loading payment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Payment History</h2>
            <p className="text-blue-100 mt-1">View all your license renewal payments</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <div className="w-6 h-6">{ICONS.x}</div>
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4">
            {error}
            <Button onClick={loadPaymentHistory} className="mt-2" size="sm">
              Retry
            </Button>
          </div>
        )}

        {payments.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-8 h-8 text-slate-400">{ICONS.receipt || '📄'}</div>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No Payments Yet</h3>
            <p className="text-slate-600">You haven't made any license renewal payments yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="font-semibold text-slate-800 capitalize">
                        {payment.license_type} License
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded border ${getStatusColor(
                          payment.status
                        )}`}
                      >
                        {payment.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500">
                      {formatDate(payment.created_at)}
                    </p>
                    {payment.gateway && (
                      <p className="text-xs text-slate-400 mt-1">
                        Gateway: {payment.gateway.toUpperCase()}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold text-slate-800">
                      {formatAmount(payment.amount, payment.currency)}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Payment ID: {payment.id.substring(0, 20)}...</span>
                    {payment.status === 'completed' && (
                      <span className="text-green-600 font-semibold">✓ Paid</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {payments.length > 0 && (
          <div className="mt-6 pt-4 border-t border-slate-200">
            <Button onClick={loadPaymentHistory} className="w-full" variant="outline">
              Refresh
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentHistory;

