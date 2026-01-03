/**
 * Cloud Login Page
 * 
 * Updated login page for cloud-based multi-tenant system.
 * Supports tenant lookup, login, registration, and license activation.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../services/api/client';
import { APP_LOGO } from '../../constants';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TenantRegistration from './TenantRegistration';
import LicenseActivation from './LicenseActivation';

type View = 'login' | 'register' | 'activate-license';

const CloudLoginPage: React.FC = () => {
  const { login, isLoading, error } = useAuth();
  const [view, setView] = useState<View>('login');
  const [tenantId, setTenantId] = useState('');
  const [tenantSearch, setTenantSearch] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const [lookupResults, setLookupResults] = useState<Array<{ id: string; name: string; company_name: string; email: string }>>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const handleLookupTenant = async () => {
    if (!tenantSearch.trim()) {
      setLookupError('Please enter email or company name');
      return;
    }

    setIsLookingUp(true);
    setLookupError('');
    setLookupResults([]);

    try {
      const response = await apiClient.post<{ tenants: Array<{ id: string; name: string; company_name: string; email: string }> }>('/api/auth/lookup-tenant', {
        email: tenantSearch.includes('@') ? tenantSearch : undefined,
        companyName: tenantSearch.includes('@') ? undefined : tenantSearch,
      });

      if (response.tenants && response.tenants.length > 0) {
        setLookupResults(response.tenants);
        if (response.tenants.length === 1) {
          // Auto-select if only one result
          setTenantId(response.tenants[0].id);
        }
      } else {
        setLookupError('No tenant found. Please check your email or company name.');
      }
    } catch (err: any) {
      setLookupError(err.error || err.message || 'Lookup failed');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!tenantId) {
      setLoginError('Please select or enter a tenant ID');
      return;
    }

    if (!username.trim()) {
      setLoginError('Username is required');
      return;
    }

    try {
      await login(username, password, tenantId);
    } catch (err: any) {
      setLoginError(err.error || err.message || 'Login failed');
    }
  };

  const handleRegistrationSuccess = () => {
    setView('login');
    // Optionally show success message
  };

  if (view === 'register') {
    return <TenantRegistration onSuccess={handleRegistrationSuccess} onCancel={() => setView('login')} />;
  }

  if (view === 'activate-license') {
    return <LicenseActivation onSuccess={() => setView('login')} onCancel={() => setView('login')} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <img src={APP_LOGO} alt="Logo" className="w-16 h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-800">PBooksPro</h1>
          <p className="text-slate-500 mt-2">Sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* Tenant Lookup */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Find Your Organization
            </label>
            <div className="flex gap-2">
              <Input
                id="tenantSearch"
                name="tenantSearch"
                placeholder="Email or company name"
                value={tenantSearch}
                onChange={e => setTenantSearch(e.target.value)}
                onKeyPress={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookupTenant();
                  }
                }}
              />
              <Button
                type="button"
                onClick={handleLookupTenant}
                disabled={isLookingUp || !tenantSearch.trim()}
                className="whitespace-nowrap"
              >
                {isLookingUp ? 'Searching...' : 'Search'}
              </Button>
            </div>
            {lookupError && (
              <p className="text-sm text-rose-600">{lookupError}</p>
            )}
            {lookupResults.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-slate-500">Select your organization:</p>
                {lookupResults.map(tenant => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => {
                      setTenantId(tenant.id);
                      setTenantSearch(tenant.company_name || tenant.name);
                      setLookupResults([]);
                    }}
                    className={`w-full text-left p-2 rounded border ${
                      tenantId === tenant.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium text-sm">{tenant.company_name || tenant.name}</div>
                    <div className="text-xs text-slate-500">{tenant.email}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Direct Tenant ID Input (Alternative) */}
          <div className="border-t pt-4">
            <Input
              id="tenantId"
              name="tenantId"
              label="Or enter Tenant ID directly"
              value={tenantId}
              onChange={e => setTenantId(e.target.value)}
              placeholder="tenant_xxxxx"
            />
          </div>

          <Input
            id="username"
            name="username"
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus={!!tenantId}
            required
            autoComplete="username"
          />

          <Input
            id="password"
            name="password"
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {(loginError || error) && (
            <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded border border-rose-200">
              {loginError || error}
            </div>
          )}

          <Button type="submit" className="w-full justify-center py-3 text-lg" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 space-y-2">
          <button
            type="button"
            onClick={() => setView('register')}
            className="w-full text-sm text-blue-600 hover:text-blue-700 text-center"
          >
            Register New Organization (Free Trial)
          </button>
          <button
            type="button"
            onClick={() => setView('activate-license')}
            className="w-full text-sm text-slate-600 hover:text-slate-700 text-center"
          >
            Activate License Key
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloudLoginPage;

