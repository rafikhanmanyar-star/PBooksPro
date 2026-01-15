// Paddle Checkout Page - Opens Paddle hosted checkout using _ptxn
import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';

declare global {
  interface Window {
    Paddle?: any;
  }
}

const PaddleCheckoutPage: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const transactionId = params.get('_ptxn') || params.get('transaction_id');

    if (!transactionId) {
      setError('Missing transaction reference. Please restart the payment.');
      setIsLoading(false);
      return;
    }

    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;
    if (!token) {
      setError('Paddle client token is not configured.');
      setIsLoading(false);
      return;
    }

    const env = (import.meta.env.VITE_PADDLE_ENV || import.meta.env.MODE) === 'production'
      ? 'live'
      : 'sandbox';

    const loadPaddleScript = () =>
      new Promise<void>((resolve, reject) => {
        if (window.Paddle) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Paddle.js'));
        document.body.appendChild(script);
      });

    const openCheckout = async () => {
      try {
        await loadPaddleScript();

        if (!window.Paddle) {
          throw new Error('Paddle.js failed to initialize.');
        }

        if (env === 'sandbox') {
          window.Paddle.Environment.set('sandbox');
        } else {
          window.Paddle.Environment.set('live');
        }

        window.Paddle.Initialize({ token });
        window.Paddle.Checkout.open({ transactionId });
      } catch (err: any) {
        setError(err?.message || 'Failed to open Paddle checkout.');
      } finally {
        setIsLoading(false);
      }
    };

    void openCheckout();
  }, []);

  const handleGoBack = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Opening Payment</h1>
          <p className="text-blue-100">Please wait while we load secure checkout</p>
        </div>

        <div className="p-8 space-y-6">
          {isLoading && !error && (
            <div className="text-center py-4">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600">Loading Paddle checkout...</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700 text-sm">
              {error}
            </div>
          )}

          <Button onClick={handleGoBack} className="w-full">
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaddleCheckoutPage;
