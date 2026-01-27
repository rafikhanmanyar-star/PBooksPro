/**
 * Cloud Login Page
 * 
 * Unified login flow:
 * All fields (organization email, username, password) on one screen for simple one-click login
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TenantRegistration from './TenantRegistration';

type View = 'login' | 'register';

const CloudLoginPage: React.FC = () => {
  const { unifiedLogin, isLoading, error } = useAuth();
  const [view, setView] = useState<View>('login');
  
  // Login form state
  const [organizationEmail, setOrganizationEmail] = useState('');
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!organizationEmail.trim()) {
      setLoginError('Organization email is required');
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

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(organizationEmail)) {
      setLoginError('Please enter a valid organization email address');
      return;
    }

    try {
      console.log('🔐 CloudLoginPage: Starting unified login...');
      await unifiedLogin(organizationEmail, username, password);
      console.log('✅ CloudLoginPage: Login successful');
      // If login successful, unifiedLogin will handle navigation
    } catch (err: any) {
      console.error('❌ CloudLoginPage: Login error:', err);
      const errorMessage = err?.error || err?.message || 'Invalid organization email, username, or password';
      setLoginError(errorMessage);
    }
  };

  const handleRegistrationSuccess = () => {
    setView('login');
  };

  if (view === 'register') {
    return <TenantRegistration onSuccess={handleRegistrationSuccess} onCancel={() => setView('login')} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">PBooksPro</h1>
          <p className="text-slate-500 mt-2">Sign in to continue</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6" autoComplete="off" data-form-type="other">
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

          <Input
            id="username"
            name="username"
            label="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
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
            autoComplete="off"
            data-form-type="other"
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

