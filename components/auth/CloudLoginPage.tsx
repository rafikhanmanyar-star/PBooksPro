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
  const { smartLogin, isLoading, error } = useAuth();
  const [view, setView] = useState<View>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [availableTenants, setAvailableTenants] = useState<Array<{ id: string; name: string; company_name: string; email: string }>>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');

  // Load last used tenant/identifier from localStorage
  React.useEffect(() => {
    const lastTenantId = localStorage.getItem('last_tenant_id');
    const lastIdentifier = localStorage.getItem('last_identifier');
    if (lastTenantId) {
      setSelectedTenantId(lastTenantId);
    }
    if (lastIdentifier) {
      setIdentifier(lastIdentifier);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setAvailableTenants([]);

    if (!identifier.trim()) {
      setLoginError('Email or username is required');
      return;
    }

    if (!password.trim()) {
      setLoginError('Password is required');
      return;
    }

    try {
      const result = await smartLogin(identifier, password, selectedTenantId || undefined);
      
      if (result.requiresTenantSelection && result.tenants) {
        // Multiple tenants found - show selection
        setAvailableTenants(result.tenants);
        if (result.tenants.length === 1) {
          // Auto-select if only one
          setSelectedTenantId(result.tenants[0].id);
        }
      }
      // If login successful, smartLogin will handle navigation
    } catch (err: any) {
      setLoginError(err.error || err.message || 'Login failed');
    }
  };

  const handleTenantSelection = async (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setLoginError('');
    
    // Retry login with selected tenant
    try {
      await smartLogin(identifier, password, tenantId);
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
          <Input
            id="identifier"
            name="identifier"
            label="Email or Username"
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            autoFocus
            required
            autoComplete="username"
            placeholder="your.email@company.com or username"
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

          {/* Show tenant selection if multiple tenants found */}
          {availableTenants.length > 1 && (
            <div className="space-y-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-2">
                Select your organization:
              </p>
              <div className="space-y-2">
                {availableTenants.map(tenant => (
                  <button
                    key={tenant.id}
                    type="button"
                    onClick={() => handleTenantSelection(tenant.id)}
                    className={`w-full text-left p-3 rounded border transition-colors ${
                      selectedTenantId === tenant.id
                        ? 'border-green-500 bg-green-50'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-800">
                      {tenant.company_name || tenant.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{tenant.email}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

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

