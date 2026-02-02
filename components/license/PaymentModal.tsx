import React, { useState, useEffect } from 'react';
import { paymentsApi, PaymentSession } from '../../services/api/payments';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  licenseType?: 'monthly' | 'yearly';
  moduleKey?: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  licenseType: initialLicenseType,
  moduleKey
}) => {
  const [selectedLicenseType, setSelectedLicenseType] = useState<'monthly' | 'yearly'>(initialLicenseType || 'yearly');
  const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentSession, setPaymentSession] = useState<PaymentSession | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const pricing = {
    monthly: {
      PKR: 7083, // ~85,000 / 12
      USD: 24
    },
    yearly: {
      PKR: 85000,
      USD: 293
    }
  };

  const getModuleName = (key: string) => {
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const modulePricing: Record<string, { PKR: number, USD: number }> = {
    real_estate: { PKR: 5000, USD: 18 },
    rental: { PKR: 3000, USD: 11 },
    tasks: { PKR: 2000, USD: 7 },
    biz_planet: { PKR: 2000, USD: 7 },
    shop: { PKR: 4000, USD: 14 }
  };

  const isModulePayment = !!moduleKey;
  const currentPrice = isModulePayment
    ? (selectedLicenseType === 'monthly' ? modulePricing[moduleKey!][currency] : modulePricing[moduleKey!][currency] * 10)
    : pricing[selectedLicenseType][currency];

  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setPaymentSession(null);
      setError(null);
      setIsLoading(false);
      setIsProcessing(false);
    }
  }, [isOpen]);

  const handleCreatePaymentSession = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const session = await paymentsApi.createPaymentSession({
        licenseType: selectedLicenseType,
        currency,
        moduleKey,
      });

      setPaymentSession(session);

      // If there's a checkout URL, redirect to it
      if (session.checkoutUrl) {
        setIsProcessing(true);

        // Check if it's a mock gateway URL (starts with /mock-payment)
        if (session.checkoutUrl.startsWith('/mock-payment')) {
          // For mock gateway, navigate to mock payment page
          window.location.href = session.checkoutUrl;
        } else {
          // For real gateways (PayFast, Paymob), redirect to gateway
          window.location.href = session.checkoutUrl;
        }
        // Note: User will be redirected back after payment
      } else if (session.clientSecret) {
        // For Paymob or other gateways that use embedded forms
        setIsProcessing(true);
        // Show payment form or redirect
        // This would need gateway-specific implementation
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create payment session. Please try again.');
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{isModulePayment ? 'Activate Module' : 'Renew License'}</h2>
              <p className="text-blue-100 mt-1">
                {isModulePayment
                  ? `Enable ${getModuleName(moduleKey!)} for your organization`
                  : 'Choose your license plan and payment method'}
              </p>
            </div>
            {!isProcessing && (
              <button
                onClick={handleClose}
                className="text-white/80 hover:text-white transition-colors"
              >
                <div className="w-6 h-6">{ICONS.x}</div>
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6">
          {!paymentSession ? (
            <>
              {/* License Type Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Select License Type
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setSelectedLicenseType('monthly')}
                    className={`p-4 border-2 rounded-lg transition-all ${selectedLicenseType === 'monthly'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <div className="text-left">
                      <div className="font-bold text-lg text-slate-800">Monthly</div>
                      <div className="text-sm text-slate-600 mt-1">Billed monthly</div>
                      <div className="text-2xl font-bold text-blue-600 mt-2">
                        {currency === 'PKR' ? 'PKR ' : '$'}
                        {isModulePayment
                          ? modulePricing[moduleKey!][currency].toLocaleString()
                          : pricing.monthly[currency].toLocaleString()}
                        {currency === 'PKR' ? '' : '/mo'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedLicenseType('yearly')}
                    className={`p-4 border-2 rounded-lg transition-all ${selectedLicenseType === 'yearly'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <div className="text-left">
                      <div className="font-bold text-lg text-slate-800">Yearly</div>
                      <div className="text-sm text-slate-600 mt-1">Best value - Save 20%</div>
                      <div className="text-2xl font-bold text-blue-600 mt-2">
                        {currency === 'PKR' ? 'PKR ' : '$'}
                        {isModulePayment
                          ? (modulePricing[moduleKey!][currency] * 10).toLocaleString()
                          : pricing.yearly[currency].toLocaleString()}
                        {currency === 'PKR' ? '/yr' : '/yr'}
                      </div>
                      <div className="text-xs text-green-600 font-semibold mt-1">
                        Save {currency === 'PKR' ? 'PKR ' : '$'}
                        {(isModulePayment
                          ? (modulePricing[moduleKey!][currency] * 2)
                          : (pricing.monthly[currency] * 12 - pricing.yearly[currency])).toLocaleString()}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Currency Selection */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Currency
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCurrency('PKR')}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${currency === 'PKR'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                  >
                    PKR (Pakistani Rupee)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('USD')}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${currency === 'USD'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                  >
                    USD (US Dollar)
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">{isModulePayment ? 'Module:' : 'License Type:'}</span>
                  <span className="font-semibold capitalize">
                    {isModulePayment ? getModuleName(moduleKey!) : selectedLicenseType}
                  </span>
                </div>
                {isModulePayment && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-600">Plan:</span>
                    <span className="font-semibold capitalize">{selectedLicenseType}</span>
                  </div>
                )}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-slate-600">Currency:</span>
                  <span className="font-semibold">{currency}</span>
                </div>
                <div className="border-t border-slate-300 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-bold text-slate-800">Total Amount:</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {currency === 'PKR' ? 'PKR' : '$'}
                      {currentPrice.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg">
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={handleClose}
                  className="flex-1 bg-slate-200 text-slate-700 hover:bg-slate-300"
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreatePaymentSession}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={isLoading}
                >
                  {isLoading ? 'Processing...' : 'Proceed to Payment'}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              {isProcessing ? (
                <>
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="w-8 h-8 text-blue-600 animate-spin">{ICONS.rotateCw}</div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Redirecting to Payment Gateway...</h3>
                  <p className="text-slate-600">
                    You will be redirected to complete your payment. Please do not close this window.
                  </p>
                  <div className="mt-4">
                    <a
                      href={paymentSession.checkoutUrl}
                      className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Continue to Payment →
                    </a>
                  </div>
                </>
              ) : (
                <div>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <div className="w-8 h-8 text-green-600">✓</div>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-2">Payment Session Created</h3>
                  <p className="text-slate-600 mb-4">
                    Your payment session has been created. Please proceed to complete the payment.
                  </p>
                  {paymentSession.checkoutUrl && (
                    <Button
                      onClick={() => {
                        window.location.href = paymentSession.checkoutUrl!;
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      Go to Payment Page
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;

