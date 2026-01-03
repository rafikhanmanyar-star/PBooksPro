/**
 * License Activation Component
 * 
 * Allows users to activate a license key for their tenant.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { APP_LOGO } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface LicenseActivationProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const LicenseActivation: React.FC<LicenseActivationProps> = ({ onSuccess, onCancel }) => {
  const { activateLicense, checkLicenseStatus, isLoading, error } = useAuth();
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseInfo, setLicenseInfo] = useState<{
    isValid: boolean;
    daysRemaining?: number;
    type?: string;
    status?: string;
  } | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    // Check current license status on mount
    checkCurrentStatus();
  }, []);

  const checkCurrentStatus = async () => {
    setCheckingStatus(true);
    try {
      const status = await checkLicenseStatus();
      setLicenseInfo(status);
    } catch (err) {
      console.error('Failed to check license status:', err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!licenseKey.trim()) {
      return;
    }

    try {
      await activateLicense(licenseKey.trim());
      // Refresh license status
      await checkCurrentStatus();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      // Error is handled by AuthContext
      console.error('License activation error:', err);
    }
  };

  const getStatusMessage = () => {
    if (!licenseInfo) {
      return null;
    }

    if (licenseInfo.isValid) {
      if (licenseInfo.type === 'trial') {
        return (
          <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded border border-blue-200">
            <strong>Free Trial Active</strong>
            {licenseInfo.daysRemaining !== undefined && (
              <p className="mt-1">{licenseInfo.daysRemaining} days remaining</p>
            )}
          </div>
        );
      } else {
        return (
          <div className="p-3 bg-green-50 text-green-700 text-sm rounded border border-green-200">
            <strong>License Active</strong>
            {licenseInfo.type && (
              <p className="mt-1">Type: {licenseInfo.type}</p>
            )}
            {licenseInfo.daysRemaining !== undefined && licenseInfo.daysRemaining > 0 && (
              <p className="mt-1">{licenseInfo.daysRemaining} days remaining</p>
            )}
          </div>
        );
      }
    } else {
      return (
        <div className="p-3 bg-amber-50 text-amber-700 text-sm rounded border border-amber-200">
          <strong>License Expired or Invalid</strong>
          <p className="mt-1">Please activate a valid license key to continue.</p>
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <img src={APP_LOGO} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800">Activate License</h1>
          <p className="text-slate-500 mt-2">Enter your license key to activate</p>
        </div>

        {checkingStatus ? (
          <div className="text-center py-8">
            <p className="text-slate-500">Checking license status...</p>
          </div>
        ) : (
          <>
            {getStatusMessage()}

            <form onSubmit={handleActivate} className="space-y-6 mt-6">
              <Input
                id="licenseKey"
                name="licenseKey"
                label="License Key"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value)}
                placeholder="Enter license key (e.g., MA-XXXXXXXX-XXXX)"
                required
                autoFocus
              />

              {error && (
                <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded border border-rose-200">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                {onCancel && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onCancel}
                    className="flex-1"
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  className="flex-1 justify-center"
                  disabled={isLoading || !licenseKey.trim()}
                >
                  {isLoading ? 'Activating...' : 'Activate License'}
                </Button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t">
              <button
                type="button"
                onClick={checkCurrentStatus}
                className="text-sm text-blue-600 hover:text-blue-700"
                disabled={checkingStatus}
              >
                {checkingStatus ? 'Checking...' : 'Refresh License Status'}
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-center text-slate-400 mt-6">
          Need a license? Contact your administrator or purchase one from the admin portal.
        </p>
      </div>
    </div>
  );
};

export default LicenseActivation;

