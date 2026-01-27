// Mock Payment Page - Simulates payment gateway checkout
// This component is used when PAYMENT_GATEWAY=mock
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

const MockPaymentPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const paymentIntentId = searchParams.get('payment_intent');
  const returnUrl = searchParams.get('return_url') || '/';
  const [status, setStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    // Simulate payment processing
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setStatus('completed');
          // Redirect after success
          setTimeout(() => {
            window.location.href = returnUrl + '?payment_status=success&payment_intent=' + paymentIntentId;
          }, 1000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [returnUrl, paymentIntentId]);

  if (!paymentIntentId) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Invalid Payment</h2>
          <p className="text-slate-600 mb-4">Payment intent ID is missing.</p>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center">
          {status === 'processing' && (
            <>
              <div className="w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Processing Payment...</h2>
              <p className="text-slate-600 mb-4">
                Simulating payment gateway processing
              </p>
              <p className="text-sm text-slate-500">
                Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...
              </p>
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-800 font-mono break-all">
                  Payment ID: {paymentIntentId}
                </p>
              </div>
            </>
          )}

          {status === 'completed' && (
            <>
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-12 h-12 text-green-600 text-4xl">✓</div>
              </div>
              <h2 className="text-2xl font-bold text-green-700 mb-2">Payment Successful!</h2>
              <p className="text-slate-600 mb-4">
                Your payment has been processed successfully.
              </p>
              <p className="text-sm text-slate-500 mb-4">
                Redirecting you back...
              </p>
            </>
          )}

          {status === 'failed' && (
            <>
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <div className="w-12 h-12 text-red-600 text-4xl">✕</div>
              </div>
              <h2 className="text-2xl font-bold text-red-700 mb-2">Payment Failed</h2>
              <p className="text-slate-600 mb-4">
                The payment could not be processed.
              </p>
              <Button onClick={() => navigate('/')}>Go Home</Button>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400">
              This is a mock payment gateway for testing purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MockPaymentPage;

