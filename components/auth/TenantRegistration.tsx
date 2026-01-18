/**
 * Tenant Registration Component
 * 
 * Allows new tenants to register and start a free 30-day trial.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { APP_LOGO } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';

const TenantRegistration: React.FC<{ onSuccess?: () => void; onCancel?: () => void }> = ({ 
  onSuccess, 
  onCancel 
}) => {
  const { registerTenant, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({
    companyName: '',
    email: '',
    phone: '',
    address: '',
    adminUsername: '',
    adminPassword: '',
    adminName: '',
    isSupplier: false,
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.companyName || !formData.companyName.trim()) {
      errors.companyName = 'Company name is required';
    }

    if (!formData.email || !formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Invalid email format';
    }

    if (!formData.adminUsername || !formData.adminUsername.trim()) {
      errors.adminUsername = 'Admin username is required';
    } else if (formData.adminUsername.trim().length < 3) {
      errors.adminUsername = 'Username must be at least 3 characters';
    }

    if (!formData.adminPassword || !formData.adminPassword.trim()) {
      errors.adminPassword = 'Password is required';
    } else if (formData.adminPassword.length < 6) {
      errors.adminPassword = 'Password must be at least 6 characters';
    }

    if (!formData.adminName || !formData.adminName.trim()) {
      errors.adminName = 'Admin name is required';
    }

    setValidationErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    
    if (!isValid) {
      console.log('Validation failed:', errors);
      // Scroll to first error
      setTimeout(() => {
        const firstErrorId = Object.keys(errors)[0];
        const element = document.getElementById(firstErrorId);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.focus();
        }
      }, 100);
    }
    
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Clear previous validation errors
    setValidationErrors({});

    if (!validate()) {
      return;
    }

    try {
      const result = await registerTenant(formData);
      // Show success message
      alert(`✅ Registration successful!\n\nTenant ID: ${result.tenantId}\nFree Trial: ${result.trialDaysRemaining} days remaining\n\nYou can now login with your credentials.`);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      // Error is handled by AuthContext and displayed in the error div
      console.error('Registration error details:', {
        error: err,
        errorType: typeof err,
        errorMessage: err?.message,
        errorError: err?.error,
        fullError: JSON.stringify(err, Object.getOwnPropertyNames(err))
      });
      
      // If error doesn't have a proper message, show more details
      if (!err?.error && !err?.message) {
        console.error('Unhandled error format:', err);
      }
      
      // Scroll to error message after a short delay
      setTimeout(() => {
        const errorElement = document.querySelector('.bg-rose-50');
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-2xl border border-slate-200">
        <div className="text-center mb-8">
          <img src={APP_LOGO} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800">PBooksPro</h1>
          <p className="text-slate-500 mt-2">Register for a free 30-day trial</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Input
                id="companyName"
                name="companyName"
                label="Company Name *"
                value={formData.companyName}
                onChange={e => handleChange('companyName', e.target.value)}
                required
                error={validationErrors.companyName}
              />
            </div>

            <Input
              id="email"
              name="email"
              label="Email *"
              type="email"
              value={formData.email}
              onChange={e => handleChange('email', e.target.value)}
              required
              error={validationErrors.email}
            />

            <Input
              id="phone"
              name="phone"
              label="Phone"
              value={formData.phone}
              onChange={e => handleChange('phone', e.target.value)}
            />

            <div className="md:col-span-2">
              <Input
                id="address"
                name="address"
                label="Address"
                value={formData.address}
                onChange={e => handleChange('address', e.target.value)}
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="isSupplier"
                    name="isSupplier"
                    type="checkbox"
                    checked={formData.isSupplier}
                    onChange={e => handleChange('isSupplier', e.target.checked)}
                    className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="isSupplier" className="font-medium text-gray-700 cursor-pointer">
                    Supplier
                  </label>
                  <p className="text-gray-500 mt-0.5">
                    Check this if your organization also works as a supplier (will be used in Biz Planet section)
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 border-t pt-4 mt-4">
              <h3 className="text-lg font-semibold text-slate-700 mb-4">Admin Account</h3>
            </div>

            <Input
              id="adminName"
              name="adminName"
              label="Admin Name *"
              value={formData.adminName}
              onChange={e => handleChange('adminName', e.target.value)}
              required
              error={validationErrors.adminName}
            />

            <Input
              id="adminUsername"
              name="adminUsername"
              label="Admin Username *"
              value={formData.adminUsername}
              onChange={e => handleChange('adminUsername', e.target.value)}
              required
              error={validationErrors.adminUsername}
            />

            <div className="md:col-span-2">
              <Input
                id="adminPassword"
                name="adminPassword"
                label="Admin Password *"
                type="password"
                value={formData.adminPassword}
                onChange={e => handleChange('adminPassword', e.target.value)}
                required
                error={validationErrors.adminPassword}
                autoComplete="off"
                data-form-type="other"
              />
            </div>
          </div>

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
              disabled={isLoading}
            >
              {isLoading ? 'Registering...' : 'Register & Start Free Trial'}
            </Button>
          </div>
        </form>

        <p className="text-xs text-center text-slate-400 mt-6">
          By registering, you agree to start a free 30-day trial. No credit card required.
        </p>
      </div>
    </div>
  );
};

export default TenantRegistration;

