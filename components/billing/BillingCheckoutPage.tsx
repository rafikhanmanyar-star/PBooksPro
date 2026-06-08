import React, { useEffect, useRef, useState } from 'react';

import Button from '../ui/Button';

import { paymentsApi } from '../../services/api/payments';

import { subscriptionBillingApi } from '../../services/api/subscriptionBillingApi';
import { getAppSearchParams, navigateToAppPath } from '../../utils/appNavigation';



declare global {

  interface Window {

    Paddle?: {

      Environment: { set: (env: string) => void };

      Initialize: (opts: {

        token: string;

        eventCallback?: (data: { name?: string; data?: unknown }) => void;

      }) => void;

      Checkout: { open: (opts: { transactionId: string }) => void };

    };

  }

}



const POLL_INTERVAL_MS = 2000;

const POLL_MAX_ATTEMPTS = 30;



const BillingCheckoutPage: React.FC = () => {

  const [error, setError] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [mockMode, setMockMode] = useState(false);

  const [checkoutComplete, setCheckoutComplete] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);



  const stopPolling = () => {

    if (pollRef.current) {

      clearInterval(pollRef.current);

      pollRef.current = null;

    }

  };



  const pollSubscriptionActivation = async () => {

    let attempts = 0;

    stopPolling();

    pollRef.current = setInterval(() => {

      void (async () => {

        attempts += 1;

        try {

          const { subscription } = await subscriptionBillingApi.getSubscription();

          if (subscription && (subscription.status === 'active' || subscription.status === 'trialing')) {

            stopPolling();

            setCheckoutComplete(true);

            navigateToAppPath('/license/payment-success');

          } else if (attempts >= POLL_MAX_ATTEMPTS) {

            stopPolling();

            setError('Payment received but subscription is still activating. Check Settings → License in a few minutes.');

          }

        } catch {

          if (attempts >= POLL_MAX_ATTEMPTS) {

            stopPolling();

          }

        }

      })();

    }, POLL_INTERVAL_MS);

  };



  useEffect(() => {

    const params = getAppSearchParams();

    const transactionId = params.get('_ptxn') || params.get('transaction_id');

    const isMock = params.get('mock') === '1';



    if (!transactionId) {

      setError('Missing transaction reference. Please restart checkout from the pricing page.');

      setIsLoading(false);

      return;

    }



    if (isMock) {

      setMockMode(true);

      setIsLoading(false);

      return;

    }



    const token = import.meta.env.VITE_PADDLE_CLIENT_TOKEN as string | undefined;

    if (!token) {

      setError('Paddle client token is not configured.');

      setIsLoading(false);

      return;

    }



    const env =

      (import.meta.env.VITE_PADDLE_ENV || import.meta.env.MODE) === 'production'

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



    void (async () => {

      try {

        await loadPaddleScript();

        if (!window.Paddle) throw new Error('Paddle.js failed to initialize.');

        window.Paddle.Environment.set(env === 'sandbox' ? 'sandbox' : 'live');

        window.Paddle.Initialize({

          token,

          eventCallback: (event) => {

            const name = event?.name ?? '';

            if (name === 'checkout.completed' || name === 'checkout.closed') {

              void pollSubscriptionActivation();

            }

          },

        });

        window.Paddle.Checkout.open({ transactionId });

      } catch (err: unknown) {

        setError(err instanceof Error ? err.message : 'Failed to open Paddle checkout.');

      } finally {

        setIsLoading(false);

      }

    })();



    return () => stopPolling();

  }, []);



  const handleMockConfirm = async () => {

    const params = getAppSearchParams();

    const transactionId = params.get('_ptxn')!;

    try {

      await paymentsApi.confirmPayment(transactionId, transactionId);

      navigateToAppPath('/license/payment-success');

    } catch (err: unknown) {

      setError(err instanceof Error ? err.message : 'Mock payment failed.');

    }

  };



  return (

    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">

      <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-8 shadow-lg text-center">

        <h1 className="text-xl font-semibold text-slate-800 mb-2">Complete your subscription</h1>

        {isLoading && !mockMode && (

          <p className="text-slate-500 animate-pulse">Opening secure checkout…</p>

        )}

        {checkoutComplete && (

          <p className="text-emerald-600 text-sm">Activating your subscription…</p>

        )}

        {mockMode && (

          <div className="space-y-4">

            <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">

              Mock checkout mode — no Paddle API key configured on the server.

            </p>

            <Button onClick={() => void handleMockConfirm()}>Confirm mock payment</Button>

          </div>

        )}

        {error && <p className="text-rose-600 text-sm mt-4">{error}</p>}

        <Button variant="secondary" className="mt-6" onClick={() => navigateToAppPath('/')}>

          Return to app

        </Button>

      </div>

    </div>

  );

};



export default BillingCheckoutPage;

