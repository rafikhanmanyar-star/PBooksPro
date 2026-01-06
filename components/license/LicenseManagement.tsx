import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { paymentsApi } from '../../services/api/payments';
import { apiClient } from '../../services/api/client';
import PaymentModal from './PaymentModal';
import PaymentHistory from './PaymentHistory';
import Button from '../ui/Button';
import { ICONS } from '../../constants';

interface LicenseInfo {
  licenseType: 'trial' | 'monthly' | 'yearly' | 'perpetual';
  licenseStatus: 'active' | 'expired' | 'suspended' | 'cancelled';
  expiryDate: string | null;
  daysRemaining: number;
  isExpired: boolean;
}

const LicenseManagement: React.FC = () => {
  const { checkLicenseStatus } = useAuth();
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  useEffect(() => {
    loadLicenseStatus();
  }, []);

  const loadLicenseStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Get detailed license info from API
      const response = await apiClient.get<LicenseInfo>('/tenants/license-status');
      setLicenseInfo(response);
    } catch (err: any) {
      console.error('Failed to load license status:', err);
      setError(err.message || 'Failed to load license information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenewalSuccess = () => {
    setShowPaymentModal(false);
    // Reload license status after successful renewal
    loadLicenseStatus();
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'expired':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'suspended':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return '✓';
      case 'expired':
        return '⚠';
      case 'suspended':
        return '⏸';
      default:
        return '•';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error || !licenseInfo) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          <p className="font-semibold">Error loading license information</p>
          <p className="text-sm mt-1">{error || 'Unknown error'}</p>
          <Button onClick={loadLicenseStatus} className="mt-3" size="sm">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* License Status Card */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
          <h2 className="text-2xl font-bold">License Information</h2>
          <p className="text-blue-100 mt-1">Your current license status and details</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-800">License Status</h3>
              <p className="text-sm text-slate-600 mt-1">Current subscription status</p>
            </div>
            <span
              className={`px-4 py-2 rounded-lg border-2 font-semibold ${getStatusColor(
                licenseInfo.licenseStatus
              )}`}
            >
              {getStatusIcon(licenseInfo.licenseStatus)} {licenseInfo.licenseStatus.toUpperCase()}
            </span>
          </div>

          <div className="border-t border-slate-200 pt-4 space-y-3">
            {/* License Type */}
            <div className="flex justify-between items-center">
              <span className="text-slate-600">License Type:</span>
              <span className="font-semibold text-slate-800 capitalize">
                {licenseInfo.licenseType}
              </span>
            </div>

            {/* Days Remaining */}
            {licenseInfo.daysRemaining !== Infinity && (
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Days Remaining:</span>
                <span
                  className={`font-semibold ${
                    licenseInfo.daysRemaining <= 7
                      ? 'text-red-600'
                      : licenseInfo.daysRemaining <= 30
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`}
                >
                  {licenseInfo.daysRemaining} days
                </span>
              </div>
            )}

            {/* Expiry Date */}
            {licenseInfo.expiryDate && (
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Expiry Date:</span>
                <span className="font-semibold text-slate-800">
                  {formatDate(licenseInfo.expiryDate)}
                </span>
              </div>
            )}

            {/* Trial Info */}
            {licenseInfo.licenseType === 'trial' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Free Trial:</strong> You are currently using the 30-day free trial.
                  Renew your license to continue using all features.
                </p>
              </div>
            )}

            {/* Expiring Soon Warning */}
            {!licenseInfo.isExpired &&
              licenseInfo.daysRemaining <= 30 &&
              licenseInfo.daysRemaining > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Renewal Reminder:</strong> Your license will expire in{' '}
                    {licenseInfo.daysRemaining} days. Renew now to avoid service interruption.
                  </p>
                </div>
              )}

            {/* Expired Warning */}
            {licenseInfo.isExpired && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <strong>License Expired:</strong> Your license has expired. Please renew to
                  continue using the application.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          onClick={() => setShowPaymentModal(true)}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <span className="mr-2">💳</span>
          Renew License
        </Button>
        <Button
          onClick={() => setShowPaymentHistory(true)}
          className="flex-1 bg-slate-200 text-slate-700 hover:bg-slate-300"
          variant="secondary"
        >
          <span className="mr-2">📋</span>
          Payment History
        </Button>
        <Button onClick={loadLicenseStatus} variant="outline" size="icon">
          <div className="w-5 h-5">{ICONS.refresh || '⟳'}</div>
        </Button>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSuccess={handleRenewalSuccess}
      />

      {/* Payment History Modal */}
      {showPaymentHistory && (
        <div className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">Payment History</h2>
              <button
                onClick={() => setShowPaymentHistory(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                <div className="w-6 h-6">{ICONS.x}</div>
              </button>
            </div>
            <div className="p-4">
              <PaymentHistory onClose={() => setShowPaymentHistory(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LicenseManagement;

