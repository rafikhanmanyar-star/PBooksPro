/**
 * Cloud Login Page
 * 
 * Two-step login flow:
 * Step 1: Enter organization email to find matching tenants
 * Step 2: Select organization and enter username/password
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TenantRegistration from './TenantRegistration';

type View = 'login' | 'register';
type LoginStep = 'lookup' | 'login';

interface Tenant {
  id: string;
  name: string;
  company_name: string;
  email: string;
}

const CloudLoginPage: React.FC = () => {
  const { lookupTenants, smartLogin, isLoading, error } = useAuth();
  const [view, setView] = useState<View>('login');
  const [step, setStep] = useState<LoginStep>('lookup');
  
  // Step 1 state
  const [organizationEmail, setOrganizationEmail] = useState('');
  const [foundTenants, setFoundTenants] = useState<Tenant[]>([]);
  const [lookupError, setLookupError] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  // Step 2 state
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // Load last used organization email from localStorage (optional convenience)
  React.useEffect(() => {
    const lastOrgEmail = localStorage.getItem('last_organization_email');
    if (lastOrgEmail) {
      setOrganizationEmail(lastOrgEmail);
    }
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError('');
    setFoundTenants([]);
    setIsLookingUp(true);

    if (!organizationEmail.trim()) {
      setLookupError('Organization email is required');
      setIsLookingUp(false);
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(organizationEmail)) {
      setLookupError('Please enter a valid email address');
      setIsLookingUp(false);
      return;
    }

    try {
      console.log('🔍 CloudLoginPage: Looking up tenants for:', organizationEmail);
      const tenants = await lookupTenants(organizationEmail);
      console.log('✅ CloudLoginPage: Found tenants:', tenants.length);

      if (tenants.length === 0) {
        setLookupError('No organization found with this email. Please check and try again.');
        setIsLookingUp(false);
        return;
      }

      // Store organization email for convenience
      localStorage.setItem('last_organization_email', organizationEmail);
      
      setFoundTenants(tenants);
      
      // If only one tenant, auto-select it
      if (tenants.length === 1) {
        setSelectedTenantId(tenants[0].id);
      }
      
      // Move to step 2
      setStep('login');
    } catch (err: any) {
      console.error('❌ CloudLoginPage: Lookup error:', err);
      const errorMessage = err?.error || err?.message || 'Failed to lookup organization';
      setLookupError(errorMessage);
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!selectedTenantId) {
      setLoginError('Please select an organization');
      return;
    }

    if (!username.trim()) {
      setLoginError('Username is required');
      return;
    }

    if (!password.trim()) {
      setLoginError('Password is required');
      return;
    }

    try {
      console.log('🔐 CloudLoginPage: Starting login...');
      await smartLogin(username, password, selectedTenantId);
      console.log('✅ CloudLoginPage: Login successful');
      // If login successful, smartLogin will handle navigation
    } catch (err: any) {
      console.error('❌ CloudLoginPage: Login error:', err);
      const errorMessage = err?.error || err?.message || 'Login failed';
      setLoginError(errorMessage);
    }
  };

  const handleBackToLookup = () => {
    setStep('lookup');
    setLoginError('');
    setSelectedTenantId('');
    setUsername('');
    setPassword('');
  };

  const handleTenantSelect = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setLoginError('');
  };

  const handleRegistrationSuccess = () => {
    setView('login');
    setStep('lookup');
  };

  if (view === 'register') {
    return <TenantRegistration onSuccess={handleRegistrationSuccess} onCancel={() => setView('login')} />;
  }

  const selectedTenant = foundTenants.find(t => t.id === selectedTenantId);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">PBooksPro</h1>
          <p className="text-slate-500 mt-2">
            {step === 'lookup' ? 'Find your organization' : 'Sign in to continue'}
          </p>
        </div>

        {step === 'lookup' ? (
          // Step 1: Organization Email Lookup
          <form onSubmit={handleLookup} className="space-y-6">
            <Input
              id="organizationEmail"
              name="organizationEmail"
              label="Organization Email"
              type="email"
              value={organizationEmail}
              onChange={e => setOrganizationEmail(e.target.value)}
              autoFocus
              required
              autoComplete="email"
              placeholder="admin@company.com"
            />

            {lookupError && (
              <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded border border-rose-200">
                {lookupError}
              </div>
            )}

            <Button type="submit" className="w-full justify-center py-3 text-lg" disabled={isLookingUp}>
              {isLookingUp ? 'Looking up...' : 'Next →'}
            </Button>
          </form>
        ) : (
          // Step 2: Organization Selection + Login
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Organization Selection */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Organization:
              </label>
              {foundTenants.length === 1 ? (
                // Single tenant - show as read-only
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="font-medium text-sm text-slate-800">
                    {foundTenants[0].company_name || foundTenants[0].name}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{foundTenants[0].email}</div>
                </div>
              ) : (
                // Multiple tenants - show selection
                <div className="space-y-2">
                  {foundTenants.map(tenant => (
                    <button
                      key={tenant.id}
                      type="button"
                      onClick={() => handleTenantSelect(tenant.id)}
                      className={`w-full text-left p-3 rounded border transition-colors ${
                        selectedTenantId === tenant.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center">
                        <div className={`w-4 h-4 rounded-full border-2 mr-3 ${
                          selectedTenantId === tenant.id
                            ? 'border-blue-500 bg-blue-500'
                            : 'border-slate-300'
                        }`}>
                          {selectedTenantId === tenant.id && (
                            <div className="w-full h-full rounded-full bg-white scale-50"></div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm text-slate-800">
                            {tenant.company_name || tenant.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{tenant.email}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Input
              id="username"
              name="username"
              label="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              required
              autoComplete="username"
              placeholder="your.username"
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

            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleBackToLookup}
                className="flex-1 justify-center py-3"
                variant="outline"
              >
                ← Back
              </Button>
              <Button type="submit" className="flex-1 justify-center py-3" disabled={isLoading || !selectedTenantId}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </div>
          </form>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setView('register')}
            className="w-full text-sm text-blue-600 hover:text-blue-700 text-center"
          >
            Register New Organization (Free Trial)
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloudLoginPage;

