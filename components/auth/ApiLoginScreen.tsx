/**
 * LAN / API mode: sign in against POST /api/auth/login (PostgreSQL-backed tenant).
 * Optional self-service organization registration via POST /api/auth/register-tenant.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Lock, AlertCircle, Eye, EyeOff, Server, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getApiRootUrl } from '../../config/apiUrl';
import { apiClient } from '../../services/api/client';
import { requestElectronWebContentsFocus } from '../../utils/electronFocusRecovery';
import { useNotification } from '../../context/NotificationContext';

const DEFAULT_TENANT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_TENANT_ID) || 'default';

/** Same keys as AuthContext login — survive logout so the next visit can prefill org and username. */
const LAST_TENANT_STORAGE_KEY = 'last_tenant_id';
const LAST_USERNAME_STORAGE_KEY = 'last_identifier';

function readStoredLastTenant(): string {
  if (typeof window === 'undefined') return DEFAULT_TENANT;
  try {
    const last = localStorage.getItem(LAST_TENANT_STORAGE_KEY);
    if (last?.trim()) return last.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_TENANT;
}

function readStoredLastUsername(): string {
  if (typeof window === 'undefined') return '';
  try {
    const u = localStorage.getItem(LAST_USERNAME_STORAGE_KEY);
    if (u?.trim()) return u.trim();
  } catch {
    /* ignore */
  }
  return '';
}

function persistLastTenant(id: string) {
  if (typeof window === 'undefined' || !id.trim()) return;
  try {
    localStorage.setItem(LAST_TENANT_STORAGE_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

function persistLastUsername(name: string) {
  if (typeof window === 'undefined' || !name.trim()) return;
  try {
    localStorage.setItem(LAST_USERNAME_STORAGE_KEY, name.trim());
  } catch {
    /* ignore */
  }
}

type ViewMode = 'login' | 'register' | 'registerSuccess';

const ApiLoginScreen: React.FC = () => {
  const { login, registerTenant, error: authError, isLoading } = useAuth();
  const { hideProgress } = useNotification();
  const [serverUrl, setServerUrl] = useState('');
  const [tenantId, setTenantId] = useState(() => readStoredLastTenant());
  const [username, setUsername] = useState(() => readStoredLastUsername());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('login');

  const [companyName, setCompanyName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [requestedTenantId, setRequestedTenantId] = useState('');
  const [registeredTenantId, setRegisteredTenantId] = useState<string | null>(null);
  const [tenantDirectory, setTenantDirectory] = useState<{ id: string; name: string }[]>([]);
  const [tenantListLoading, setTenantListLoading] = useState(false);
  const [tenantListHint, setTenantListHint] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setServerUrl(getApiRootUrl());
  }, []);

  /** Defensive: full-screen notification progress can outlive logout and block this screen. */
  useEffect(() => {
    hideProgress();
  }, [hideProgress]);

  /**
   * Logout replaces the whole app shell; on Electron (Windows) webContents can stop receiving
   * keys until minimize/restore. Nudge main-process focus and repair detached DOM focus.
   */
  useEffect(() => {
    if (view !== 'login') return;
    const repair = () => {
      try {
        const ae = document.activeElement;
        if (ae && ae !== document.body && !document.body.contains(ae)) {
          document.body.focus();
        }
      } catch {
        /* ignore */
      }
      requestElectronWebContentsFocus('api-login-screen');
    };
    repair();
    const t0 = window.setTimeout(repair, 0);
    const t1 = window.setTimeout(repair, 100);
    const t2 = window.setTimeout(repair, 350);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [view]);

  /**
   * After webContents focus repair, focus password when username was prefilled from storage
   * (e.g. after logout). Do not depend on `username` state — that re-ran on every keystroke and
   * stole focus from the username field after the first character.
   * If the user already focused another field in this form (e.g. API URL or username), do not steal focus.
   */
  useEffect(() => {
    if (view !== 'login') return;
    const prefilled = readStoredLastUsername().trim();
    if (!prefilled || password) return;
    const id = window.setTimeout(() => {
      const form = document.getElementById('api-login-form');
      const active = document.activeElement;
      if (form && active && form.contains(active) && active instanceof HTMLInputElement) {
        return;
      }
      if (form && active && form.contains(active) && active instanceof HTMLSelectElement) {
        return;
      }
      passwordInputRef.current?.focus({ preventScroll: true });
    }, 150);
    return () => clearTimeout(id);
  }, [view, password]);

  const rootUrl = () => (serverUrl.trim() || 'http://127.0.0.1:3000').replace(/\/+$/, '');

  /** Load organizations from GET /api/auth/tenants when API URL or login view changes. */
  useEffect(() => {
    if (view !== 'login') return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setTenantListLoading(true);
        setTenantListHint(null);
        try {
          apiClient.setBaseUrl(rootUrl());
          const rows = await apiClient.get<Array<{ id: string; name: string }>>('/auth/tenants');
          if (!cancelled) {
            setTenantDirectory(Array.isArray(rows) ? rows : []);
          }
        } catch {
          if (!cancelled) {
            setTenantDirectory([]);
            setTenantListHint(
              'Could not load organizations. Check the API URL and that the server is running, or type your organization ID below.'
            );
          }
        } finally {
          if (!cancelled) setTenantListLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, serverUrl]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const tid = tenantId.trim() || 'default';
    const user = username.trim();
    if (!user) {
      setError('Username is required.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    try {
      apiClient.setBaseUrl(rootUrl());
      await login(user, password, tid);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : 'Login failed.';
      setError(msg);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!companyName.trim()) {
      setError('Company name is required.');
      return;
    }
    if (!orgEmail.trim()) {
      setError('Email is required.');
      return;
    }
    if (!adminName.trim() || !adminUsername.trim() || adminUsername.trim().length < 3) {
      setError('Admin name and username (min 3 characters) are required.');
      return;
    }
    if (!adminPassword || adminPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      apiClient.setBaseUrl(rootUrl());
      const result = await registerTenant({
        companyName: companyName.trim(),
        email: orgEmail.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        adminName: adminName.trim(),
        adminUsername: adminUsername.trim(),
        adminPassword,
        requestedTenantId: requestedTenantId.trim() || undefined,
      });
      setRegisteredTenantId(result.tenantId);
      setTenantId(result.tenantId);
      persistLastTenant(result.tenantId);
      const adminUser = adminUsername.trim();
      setUsername(adminUser);
      persistLastUsername(adminUser);
      setPassword('');
      setView('registerSuccess');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : 'Registration failed.';
      setError(msg);
    }
  };

  const displayError = error || authError;

  const goToRegister = () => {
    setError(null);
    setView('register');
  };

  const goToLogin = () => {
    setError(null);
    setView('login');
  };

  const continueAfterRegister = () => {
    setView('login');
    setPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-600 text-white mb-4 shadow-lg">
            {view === 'register' || view === 'registerSuccess' ? (
              <Building2 className="w-7 h-7" />
            ) : (
              <Lock className="w-7 h-7" />
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900">PBooks Pro</h1>
          <p className="text-gray-500 mt-1 text-sm">
            {view === 'login' && 'Sign in to your organization (API mode)'}
            {view === 'register' && 'Create a new organization'}
            {view === 'registerSuccess' && 'Organization created'}
          </p>
        </div>

        {view === 'registerSuccess' && registeredTenantId && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
              <p className="font-medium">Your organization ID</p>
              <p className="mt-1 font-mono text-base break-all">{registeredTenantId}</p>
              <p className="mt-2 text-emerald-800">
                Sign in using this ID, your admin username, and password. The API server URL is unchanged.
              </p>
            </div>
            <button
              type="button"
              onClick={continueAfterRegister}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
            >
              Continue to sign in
            </button>
          </div>
        )}

        {view === 'login' && (
          <form
            id="api-login-form"
            onSubmit={handleLoginSubmit}
            className="relative z-10 bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4"
            autoComplete="off"
          >
            {displayError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{displayError}</p>
              </div>
            )}

            <div>
              <label htmlFor="api-server" className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-gray-500" aria-hidden />
                API server (host and port)
              </label>
              <input
                id="api-server"
                type="url"
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.10:3000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={isLoading}
                autoComplete="off"
              />
              <p className="text-xs text-gray-500 mt-1">Use your PBooks API server URL (port is usually 3000). Saved on this device.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="api-tenant-pick" className="block text-sm font-medium text-gray-700 mb-1">
                Choose organization
              </label>
              <select
                id="api-tenant-pick"
                value={tenantDirectory.some(t => t.id === tenantId) ? tenantId : ''}
                onChange={e => {
                  const v = e.target.value;
                  if (v) {
                    setTenantId(v);
                    persistLastTenant(v);
                  }
                }}
                disabled={isLoading || tenantListLoading}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 bg-white"
              >
                <option value="">
                  {tenantListLoading ? 'Loading organizations from server…' : '— Select from list —'}
                </option>
                {tenantDirectory.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.id}
                  </option>
                ))}
              </select>
              {tenantListHint && <p className="text-xs text-amber-700">{tenantListHint}</p>}
              {!tenantListLoading && tenantDirectory.length > 0 && (
                <p className="text-xs text-gray-500">
                  {tenantDirectory.length} organization{tenantDirectory.length === 1 ? '' : 's'} on this server.
                </p>
              )}

              <label htmlFor="api-tenant" className="block text-sm font-medium text-gray-700 mb-1 pt-1">
                Organization / tenant ID
              </label>
              <input
                id="api-tenant"
                type="text"
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                onBlur={() => persistLastTenant(tenantId)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 font-mono text-sm"
                disabled={isLoading}
                placeholder="default"
                autoComplete="organization"
              />
              <p className="text-xs text-gray-500">
                Pick one above or type the ID (needed if your org is not listed or the server could not be reached).
              </p>
            </div>

            <div>
              <label htmlFor="api-username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="api-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onBlur={() => persistLastUsername(username)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                autoFocus={!username.trim()}
                disabled={isLoading}
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="api-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  ref={passwordInputRef}
                  id="api-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-center text-sm text-gray-600">
              <button
                type="button"
                onClick={goToRegister}
                className="text-green-700 hover:text-green-800 font-medium underline-offset-2 hover:underline"
              >
                Create a new organization
              </button>
            </p>
          </form>
        )}

        {view === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-3 max-h-[min(90vh,720px)] overflow-y-auto" autoComplete="off">
            {displayError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{displayError}</p>
              </div>
            )}

            <div>
              <label htmlFor="reg-server" className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-gray-500" aria-hidden />
                API server (host and port)
              </label>
              <input
                id="reg-server"
                type="url"
                value={serverUrl}
                onChange={e => setServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:3000"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={isLoading}
                autoComplete="off"
              />
            </div>

            <div>
              <label htmlFor="reg-company" className="block text-sm font-medium text-gray-700 mb-1">
                Company name
              </label>
              <input
                id="reg-company"
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                value={orgEmail}
                onChange={e => setOrgEmail(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={isLoading}
                required
                autoComplete="email"
              />
            </div>

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label htmlFor="reg-phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="reg-phone"
                  type="text"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="reg-address" className="block text-sm font-medium text-gray-700 mb-1">
                  Address <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  id="reg-address"
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-tenant-id" className="block text-sm font-medium text-gray-700 mb-1">
                Preferred organization ID <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                id="reg-tenant-id"
                type="text"
                value={requestedTenantId}
                onChange={e => setRequestedTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="e.g. acme-corp"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900 font-mono text-sm"
                disabled={isLoading}
                autoComplete="off"
              />
              <p className="text-xs text-gray-500 mt-1">Lowercase letters, numbers, hyphens. Leave empty to auto-generate.</p>
            </div>

            <div className="border-t border-gray-100 pt-3 mt-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Admin account</p>
            </div>

            <div>
              <label htmlFor="reg-admin-name" className="block text-sm font-medium text-gray-700 mb-1">
                Full name
              </label>
              <input
                id="reg-admin-name"
                type="text"
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label htmlFor="reg-admin-user" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                id="reg-admin-user"
                type="text"
                value={adminUsername}
                onChange={e => setAdminUsername(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                disabled={isLoading}
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label htmlFor="reg-admin-pass" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="reg-admin-pass"
                  type={showAdminPassword ? 'text' : 'password'}
                  value={adminPassword}
                  onChange={e => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none text-gray-900"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowAdminPassword(v => !v)}
                  tabIndex={-1}
                  aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                >
                  {showAdminPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Creating organization…' : 'Create organization'}
            </button>

            <p className="text-center text-sm text-gray-600">
              <button type="button" onClick={goToLogin} className="text-gray-700 hover:text-gray-900 font-medium">
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default ApiLoginScreen;
