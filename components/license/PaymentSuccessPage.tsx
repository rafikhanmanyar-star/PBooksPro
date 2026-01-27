// Payment Success Page - Shown after successful payment
import React, { useEffect, useState } from 'react';
import { useLicense } from '../../context/LicenseContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

const PaymentSuccessPage: React.FC = () => {
  const [paymentIntent, setPaymentIntent] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCheckingLicense, setIsCheckingLicense] = useState(true);
  const [licenseRefreshed, setLicenseRefreshed] = useState(false);
  const { checkLicenseStatus } = useLicense();
  const { checkLicenseStatus: checkCloudLicense } = useAuth();

  useEffect(() => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    const intent = params.get('payment_intent') || params.get('_ptxn');
    const paymentStatus = params.get('status') || params.get('payment_status');
    const inferredStatus = paymentStatus || (intent ? 'success' : null);
    
    setPaymentIntent(intent);
    setStatus(inferredStatus);

    // Refresh license status after payment
    const refreshLicense = async () => {
      try {
        setIsCheckingLicense(true);
        
        // Try cloud license check first, fallback to local
        if (checkCloudLicense) {
          await checkCloudLicense();
        } else if (checkLicenseStatus) {
          await checkLicenseStatus();
        }
        
        setLicenseRefreshed(true);
      } catch (error) {
        console.error('Failed to refresh license status:', error);
      } finally {
        setIsCheckingLicense(false);
      }
    };

    // Paddle returns only _ptxn on success for some setups
    if (inferredStatus === 'success' && intent) {
      refreshLicense();
    } else {
      setIsCheckingLicense(false);
    }

    // Clean up URL after a delay
    setTimeout(() => {
      window.history.replaceState({}, '', window.location.pathname);
    }, 2000);
  }, [checkLicenseStatus, checkCloudLicense]);

  const handleGoToDashboard = () => {
    // Navigate to dashboard by reloading the app
    window.location.href = '/';
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          {/* Success Header */}
          <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-12 h-12 text-white text-5xl">✓</div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-green-100">Your license has been renewed</p>
          </div>

          {/* Content */}
          <div className="p-8 space-y-6">
            {isCheckingLicense ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600">Verifying license renewal...</p>
              </div>
            ) : licenseRefreshed ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8 text-green-600 text-2xl">✓</div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">License Activated</h3>
                <p className="text-slate-600">
                  Your license has been successfully renewed and activated.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-slate-600">
                  Payment processed successfully. Your license renewal is being processed.
                </p>
              </div>
            )}

            {paymentIntent && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-xs text-slate-500 uppercase font-bold mb-1">Payment Reference</p>
                <code className="text-sm font-mono text-slate-800 break-all">{paymentIntent}</code>
              </div>
            )}

            <div className="space-y-3">
              <Button
                onClick={handleGoToDashboard}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Go to Dashboard
              </Button>
              <p className="text-xs text-center text-slate-500">
                You can now access all features of PBooksPro
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'canceled') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-8 text-center">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <div className="w-12 h-12 text-white text-4xl">⚠</div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Payment Canceled</h1>
            <p className="text-amber-100">You canceled the payment process</p>
          </div>

          <div className="p-8 space-y-6">
            <p className="text-slate-600 text-center">
              Your payment was not processed. You can try again when you're ready.
            </p>
            <Button
              onClick={handleGoToDashboard}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Default/Error state
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="bg-slate-800 p-8 text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-12 h-12 text-white text-4xl">?</div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Payment Status</h1>
          <p className="text-slate-300">Unable to determine payment status</p>
        </div>

        <div className="p-8 space-y-6">
          {paymentIntent && (
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Payment Reference</p>
              <code className="text-sm font-mono text-slate-800 break-all">{paymentIntent}</code>
              <p className="text-xs text-slate-500 mt-2">
                We received a payment reference but no status was provided. If this persists, contact support with the reference above.
              </p>
            </div>
          )}
          <p className="text-slate-600 text-center">
            We couldn't determine the status of your payment. Please check your payment history or contact support.
          </p>
          <Button
            onClick={handleGoToDashboard}
            className="w-full bg-slate-600 hover:bg-slate-700 text-white"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;

