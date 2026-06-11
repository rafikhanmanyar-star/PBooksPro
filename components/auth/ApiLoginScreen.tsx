/**
 * LAN / API mode: sign in against POST /api/auth/login (PostgreSQL-backed tenant).
 * Optional self-service organization registration via POST /api/auth/register-tenant.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Lock,
  AlertCircle,
  Eye,
  EyeOff,
  Server,
  Building2,
  User,
  Hash,
  Loader2,
  BarChart3,
  Shield,
  Layers,
  CheckCircle2,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import LegalAcceptanceCheckbox from '../legal/LegalAcceptanceCheckbox';
import MfaLoginPanel from './MfaLoginPanel';
import type { LegalAcceptanceInput } from '../../services/api/legalApi';
import { getApiRootUrl, getAppDisplayName, isStagingEnvironment, getDefaultApiRootUrl, isCloudHostedApi, isCloudApiUrl } from '../../config/apiUrl';
import { apiClient } from '../../services/api/client';
import { formatApiErrorMessage } from '../../utils/formatApiErrorMessage';
import { requestElectronWebContentsFocus } from '../../utils/electronFocusRecovery';
import { useNotification } from '../../context/NotificationContext';
import { DEMO_PUBLIC_TENANT_ID } from '../../config/demoEnvironment';
import {
  isAutoDemoUrl,
  isWebsiteDemoEntry,
  markWebsiteDemoEntry,
} from '../../utils/demoAuthBootstrap';
import Button from '../ui/Button';

const DEMO_TENANT_LABEL = 'Al Noor Properties';

const DEFAULT_TENANT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEFAULT_TENANT_ID) ||
  (isStagingEnvironment() ? 'test-company' : 'default');

/** Same keys as AuthContext login — survive logout so the next visit can prefill org and username. */
const LAST_TENANT_STORAGE_KEY = 'last_tenant_id';
const LAST_EMAIL_STORAGE_KEY = 'last_identifier';

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

function readStoredLastEmail(): string {
  if (typeof window === 'undefined') return '';
  try {
    const u = localStorage.getItem(LAST_EMAIL_STORAGE_KEY);
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

function persistLastEmail(email: string) {
  if (typeof window === 'undefined' || !email.trim()) return;
  try {
    localStorage.setItem(LAST_EMAIL_STORAGE_KEY, email.trim());
  } catch {
    /* ignore */
  }
}

const API_SAVED_LOGIN_KEY = 'pbookspro_api_saved_login';

function readSavedApiPassword(email: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(API_SAVED_LOGIN_KEY);
    if (!raw) return '';
    const o = JSON.parse(raw) as { email?: string; username?: string; password?: string };
    const stored = (o.email || o.username || '').trim().toLowerCase();
    if (stored !== (email || '').trim().toLowerCase()) return '';
    return typeof o.password === 'string' ? o.password : '';
  } catch {
    return '';
  }
}

function persistSavedApiLogin(email: string, password: string) {
  try {
    localStorage.setItem(
      API_SAVED_LOGIN_KEY,
      JSON.stringify({
        email: email.trim(),
        password,
      })
    );
  } catch {
    /* ignore */
  }
}

function clearSavedApiLogin() {
  try {
    localStorage.removeItem(API_SAVED_LOGIN_KEY);
  } catch {
    /* ignore */
  }
}

type ViewMode = 'login' | 'register' | 'registerSuccess';

const INPUT_BASE =
  'block w-full rounded-ds-md border border-app-input-border bg-app-input text-app-text shadow-ds-card placeholder:text-app-muted/70 transition-all duration-ds focus:outline-none focus:ring-2 focus:ring-ds-primary/35 focus:border-ds-primary disabled:opacity-60 disabled:cursor-not-allowed';

const FIELD_INPUT = `${INPUT_BASE} pl-10 pr-3 py-2.5 sm:py-2 text-base sm:text-ds-body min-h-[44px] sm:min-h-0`;

const ERP_FEATURES = [
  { icon: BarChart3, label: 'Financial reporting & analytics' },
  { icon: Layers, label: 'Project & portfolio management' },
  { icon: Shield, label: 'Multi-tenant organization security' },
] as const;

function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-3 rounded-ds-md border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-800 animate-fade-in-fast dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
    >
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500 dark:text-red-400" aria-hidden />
      <p className="leading-relaxed">{message}</p>
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-ds-small font-semibold text-app-text">
      {children}
      {required && (
        <span className="ml-0.5 text-ds-danger" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

function FieldHelper({ id, children, variant = 'muted' }: { id?: string; children: React.ReactNode; variant?: 'muted' | 'warning' }) {
  const tone =
    variant === 'warning'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-app-muted';
  return (
    <p id={id} className={`mt-1.5 text-ds-small leading-relaxed ${tone}`}>
      {children}
    </p>
  );
}

function IconField({
  icon: Icon,
  children,
  trailing,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3" aria-hidden>
        <Icon className="h-[18px] w-[18px] text-app-muted" />
      </div>
      {children}
      {trailing}
    </div>
  );
}

function LoginBrandPanel() {
  const appName = getAppDisplayName();
  const staging = isStagingEnvironment();

  return (
    <aside
      className="relative hidden lg:flex lg:w-[44%] xl:w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-10 xl:p-12 text-white"
      aria-label="PBooksPro product information"
    >
      <div className="pointer-events-none absolute inset-0 opacity-30" aria-hidden>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="absolute -bottom-16 left-10 h-64 w-64 rounded-full bg-teal-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 animate-slide-in-left">
        <div className="mb-8 inline-flex items-center justify-center rounded-2xl bg-emerald-500/20 p-3 ring-1 ring-emerald-400/30 backdrop-blur-sm">
          <Sparkles className="h-8 w-8 text-emerald-300" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold tracking-tight xl:text-4xl">{appName}</h1>
        <p className="mt-2 text-lg font-medium text-emerald-100/90">Enterprise Resource Planning</p>
        {staging && (
          <p className="mt-4 inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
            Staging — test environment
          </p>
        )}
        <p className="mt-6 max-w-md text-sm leading-relaxed text-slate-300">
          Connect to your organization&apos;s API server for real-time accounting, project profitability,
          and portfolio insights — built for finance teams and project operators.
        </p>
      </div>

      <ul className="relative z-10 mt-10 space-y-4 animate-fade-in">
        {ERP_FEATURES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-3 text-sm text-slate-200">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/10">
              <Icon className="h-4 w-4 text-emerald-300" aria-hidden />
            </span>
            {label}
          </li>
        ))}
      </ul>

      <p className="relative z-10 mt-10 text-xs text-slate-500">
        Secure API authentication · PostgreSQL-backed tenants · LAN &amp; local deployment
      </p>
    </aside>
  );
}

function MobileBrandHeader({ view }: { view: ViewMode }) {
  const staging = isStagingEnvironment();
  return (
    <div className="mb-6 text-center lg:hidden animate-fade-in-fast">
      <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-900/20">
        {view === 'register' || view === 'registerSuccess' ? (
          <Building2 className="h-7 w-7" aria-hidden />
        ) : (
          <Lock className="h-7 w-7" aria-hidden />
        )}
      </div>
      <h1 className="text-ds-h2 font-bold text-app-text">{getAppDisplayName()}</h1>
      {staging && (
        <p className="mt-2 inline-block rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-200">
          Staging — test environment
        </p>
      )}
    </div>
  );
}

function AuthCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-app-border bg-app-card p-6 shadow-ds-modal transition-shadow duration-300 sm:p-8 animate-slide-in-up ${className}`}
    >
      {children}
    </div>
  );
}

function AuthCardHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle: string;
  icon: React.ElementType;
}) {
  return (
    <div className="mb-6 hidden lg:block">
      <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-ds-h2 font-bold text-app-text">{title}</h2>
      <p className="mt-1 text-ds-body text-app-muted">{subtitle}</p>
    </div>
  );
}

const ApiLoginScreen: React.FC = () => {
  const { login, registerTenant, enterDemoSession, error: authError, isLoading } = useAuth();
  const [demoEntering, setDemoEntering] = useState(false);
  const { hideProgress } = useNotification();
  const [serverUrl, setServerUrl] = useState('');
  const [email, setEmail] = useState(() => readStoredLastEmail());
  const [password, setPassword] = useState(() => readSavedApiPassword(readStoredLastEmail()));
  const [savePassword, setSavePassword] = useState(() => {
    const p = readSavedApiPassword(readStoredLastEmail());
    return p.length > 0;
  });
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
  const [registeredReference, setRegisteredReference] = useState<string | null>(null);
  const [registrationPendingApproval, setRegistrationPendingApproval] = useState(false);
  const [organizationApprovalRequired, setOrganizationApprovalRequired] = useState(true);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalAcceptances, setLegalAcceptances] = useState<LegalAcceptanceInput[]>([]);
  const [mfaPhase, setMfaPhase] = useState<'challenge' | 'setup' | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaSetupToken, setMfaSetupToken] = useState<string | null>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const demoAutoEnterAttempted = useRef(false);
  const websiteDemoEntry = isWebsiteDemoEntry();
  const isDemoTenantLogin = websiteDemoEntry;

  useEffect(() => {
    if (isAutoDemoUrl()) {
      markWebsiteDemoEntry();
    }
  }, []);

  useEffect(() => {
    if (view !== 'login' || !websiteDemoEntry || demoAutoEnterAttempted.current) return;
    demoAutoEnterAttempted.current = true;
    let cancelled = false;
    void (async () => {
      setError(null);
      setDemoEntering(true);
      try {
        const apiRoot = (serverUrl.trim() || getDefaultApiRootUrl()).replace(/\/+$/, '');
        apiClient.setBaseUrl(apiRoot);
        await enterDemoSession();
        if (!cancelled) {
          persistLastTenant(DEMO_PUBLIC_TENANT_ID);
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatApiErrorMessage(e));
        }
      } finally {
        if (!cancelled) {
          setDemoEntering(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, websiteDemoEntry, enterDemoSession, serverUrl]);

  useEffect(() => {
    const root = getApiRootUrl();
    setServerUrl(root);
    try {
      apiClient.setBaseUrl(root);
    } catch {
      const fallback = getDefaultApiRootUrl();
      setServerUrl(fallback);
      apiClient.setBaseUrl(fallback);
    }
  }, []);

  useEffect(() => {
    const trimmed = serverUrl.trim();
    if (!trimmed) return;
    try {
      apiClient.setBaseUrl(trimmed);
      void apiClient
        .get<{
          organizationApprovalRequired?: boolean;
        }>('/auth/public-config')
        .then((cfg) => {
          setOrganizationApprovalRequired(cfg.organizationApprovalRequired !== false);
        })
        .catch(() => {
          setOrganizationApprovalRequired(true);
        });
    } catch {
      /* invalid URL while typing */
    }
  }, [serverUrl]);

  useEffect(() => {
    const trimmed = serverUrl.trim();
    if (!trimmed) return;
    try {
      apiClient.setBaseUrl(trimmed);
    } catch {
      /* invalid URL while typing */
    }
  }, [serverUrl]);

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
    if (view !== 'login' || isDemoTenantLogin) return;
    const prefilled = readStoredLastEmail().trim();
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
  }, [view, password, isDemoTenantLogin]);

  const rootUrl = () => (serverUrl.trim() || getDefaultApiRootUrl()).replace(/\/+$/, '');

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailVal = email.trim();
    if (!isDemoTenantLogin && !emailVal) {
      setError('Email address is required.');
      return;
    }
    if (!isDemoTenantLogin && !password) {
      setError('Password is required.');
      return;
    }
    try {
      apiClient.setBaseUrl(rootUrl());
      if (isDemoTenantLogin) {
        await enterDemoSession();
        persistLastTenant(DEMO_PUBLIC_TENANT_ID);
        return;
      }
      const result = await login(emailVal, password);
      if (result.status === 'mfa_required') {
        setError(null);
        setMfaPhase('challenge');
        setMfaToken(result.mfaToken);
        setMfaSetupToken(null);
        return;
      }
      if (result.status === 'mfa_setup_required') {
        setError(null);
        setMfaPhase('setup');
        setMfaSetupToken(result.mfaSetupToken);
        setMfaToken(null);
        return;
      }
      if (result.status === 'company_selection_required') {
        return;
      }
      if (result.status === 'authenticated') {
        persistLastEmail(emailVal);
        if (savePassword) {
          persistSavedApiLogin(emailVal, password);
        } else {
          clearSavedApiLogin();
        }
        return;
      }
      setError('Sign-in did not complete. Please try again.');
    } catch (err: unknown) {
      const apiErr = err as {
        code?: string;
        error?: string;
        message?: string;
        title?: string;
        rejectionReason?: string;
      };
      let msg = formatApiErrorMessage(err);
      if (apiErr.code === 'AUTH_FAILED' || msg === 'Invalid credentials') {
        msg = 'Invalid email or password. Please try again.';
      } else if (apiErr.code === 'ORG_PENDING_APPROVAL') {
        msg = 'Account Pending Approval\n\nYour organization has not yet been approved. Please contact support if approval is delayed.';
      } else if (apiErr.code === 'ORG_REGISTRATION_REJECTED') {
        const reason = apiErr.rejectionReason ? `\n\nReason: ${apiErr.rejectionReason}` : '';
        msg = `Organization Registration Rejected\n\nPlease contact support for additional information.${reason}`;
      } else if (apiErr.code === 'ORG_SUSPENDED') {
        msg = 'Organization Suspended\n\nPlease contact billing or support.';
      }
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
    if (!adminPassword || adminPassword.length < 8) {
      setError('Password must be at least 8 characters (include a letter and a number).');
      return;
    }
    if (!legalAccepted || legalAcceptances.length === 0) {
      setError('You must accept the Terms of Service and Privacy Policy.');
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
        legalAcceptances,
      });
      setRegisteredTenantId(result.tenantId);
      setRegisteredReference(result.registrationReference ?? null);
      setRegistrationPendingApproval(!!result.pendingApproval);
      persistLastTenant(result.tenantId);
      const registeredEmail = orgEmail.trim();
      setEmail(registeredEmail);
      persistLastEmail(registeredEmail);
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

  const cloudSignup =
    isCloudHostedApi() || isCloudApiUrl(rootUrl()) || isCloudApiUrl(getDefaultApiRootUrl());
  const canSubmitRegistration = !isLoading && legalAccepted && legalAcceptances.length > 0;
  const registrationBlockers: string[] = [];
  if (!legalAccepted || legalAcceptances.length === 0) {
    registrationBlockers.push('Accept the Terms of Service and Privacy Policy');
  }

  const goToRegister = () => {
    setError(null);
    setLegalAccepted(false);
    setLegalAcceptances([]);
    setView('register');
  };

  const goToLogin = () => {
    setError(null);
    setMfaPhase(null);
    setMfaToken(null);
    setMfaSetupToken(null);
    setView('login');
  };

  const finishMfaLogin = () => {
    const emailVal = email.trim();
    if (savePassword) {
      persistSavedApiLogin(emailVal, password);
    } else {
      clearSavedApiLogin();
    }
    setMfaPhase(null);
    setMfaToken(null);
    setMfaSetupToken(null);
  };

  const continueAfterRegister = () => {
    setView('login');
    setPassword('');
  };

  const loginSubtitle =
    view === 'login'
      ? 'Sign in to your organization (API mode)'
      : view === 'register'
        ? 'Create a new organization'
        : 'Organization created';

  const headerIcon = view === 'register' || view === 'registerSuccess' ? Building2 : Lock;

  return (
    <div className="flex min-h-screen bg-app-bg">
      <LoginBrandPanel />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-10 xl:px-14">
        <div className={`w-full ${view === 'register' ? 'max-w-4xl' : 'max-w-lg'}`}>
          <MobileBrandHeader view={view} />

          {view !== 'registerSuccess' && (
            <p className="mb-4 text-center text-ds-body text-app-muted lg:hidden">{loginSubtitle}</p>
          )}

          {view === 'registerSuccess' && registeredTenantId && (
            <AuthCard>
              <AuthCardHeader
                icon={CheckCircle2}
                title={
                  registrationPendingApproval
                    ? 'Organization Registration Submitted'
                    : 'Organization created'
                }
                subtitle={
                  registrationPendingApproval
                    ? 'Your request has been received.'
                    : 'Your tenant is ready — sign in with the credentials below.'
                }
              />
              <div className="space-y-5">
                <div
                  className={`rounded-ds-md border p-4 text-sm ${
                    registrationPendingApproval
                      ? 'border-amber-200/80 bg-amber-50 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-100'
                      : 'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-100'
                  }`}
                >
                  {registrationPendingApproval ? (
                    <>
                      <p>Your organization is currently awaiting approval.</p>
                      <p className="mt-2">
                        You will receive an email once your account has been reviewed.
                      </p>
                      {registeredReference && (
                        <>
                          <p className="mt-4 font-semibold">Reference ID</p>
                          <p className="mt-1 font-mono text-base">{registeredReference}</p>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">Your organization ID</p>
                      <p className="mt-1 break-all font-mono text-base">{registeredTenantId}</p>
                      <p className="mt-2">
                        Sign in with your email and password. The API server URL is unchanged.
                      </p>
                    </>
                  )}
                </div>
                <Button type="button" onClick={continueAfterRegister} className="w-full !bg-emerald-600 hover:!bg-emerald-700">
                  {registrationPendingApproval ? 'Back to sign in' : 'Continue to sign in'}
                </Button>
              </div>
            </AuthCard>
          )}

          {view === 'login' && mfaPhase && (
            <AuthCard>
              <MfaLoginPanel
                mode={mfaPhase}
                mfaToken={mfaToken ?? undefined}
                mfaSetupToken={mfaSetupToken ?? undefined}
                usernameForStorage={email.trim()}
                onBack={() => {
                  setMfaPhase(null);
                  setMfaToken(null);
                  setMfaSetupToken(null);
                }}
                onComplete={finishMfaLogin}
              />
            </AuthCard>
          )}

          {view === 'login' && !mfaPhase && (
            <AuthCard>
              <AuthCardHeader
                icon={headerIcon}
                title={websiteDemoEntry ? 'Live demo' : 'Welcome back'}
                subtitle={
                  websiteDemoEntry
                    ? 'Opening the Al Noor Properties sandbox — no login required.'
                    : 'Sign in with your email and password'
                }
              />

              <form
                id="api-login-form"
                onSubmit={handleLoginSubmit}
                className="relative z-10 space-y-4"
                autoComplete="off"
                noValidate
              >
                {displayError && <AuthErrorBanner message={displayError} />}

                {!websiteDemoEntry && (
                  <div>
                    <FieldLabel htmlFor="api-server">API server (host and port)</FieldLabel>
                    <IconField icon={Server}>
                      <input
                        id="api-server"
                        type="url"
                        value={serverUrl}
                        onChange={e => setServerUrl(e.target.value)}
                        placeholder={isStagingEnvironment() ? 'http://127.0.0.1:3001' : 'http://192.168.1.10:3000'}
                        className={FIELD_INPUT}
                        disabled={isLoading}
                        autoComplete="off"
                      />
                    </IconField>
                    <FieldHelper>
                      {isStagingEnvironment()
                        ? 'Staging API server — use port 3001 (PBooks Pro Staging API Server). Saved on this device.'
                        : 'Production API server — use port 3000. Saved on this device.'}
                    </FieldHelper>
                  </div>
                )}

                {websiteDemoEntry ? (
                  <div className="rounded-ds-md border border-emerald-200/80 bg-emerald-50/80 px-3 py-3 dark:border-emerald-500/25 dark:bg-emerald-500/10">
                    <p className="text-ds-small font-semibold text-emerald-900 dark:text-emerald-100">
                      {DEMO_TENANT_LABEL}
                    </p>
                    <p className="mt-1 text-ds-small text-emerald-800/90 dark:text-emerald-200/90">
                      Live demo environment — no password required. Sample data resets daily.
                    </p>
                    {demoEntering && (
                      <p className="mt-2 flex items-center gap-2 text-ds-small text-emerald-900 dark:text-emerald-100">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Opening live demo…
                      </p>
                    )}
                  </div>
                ) : null}

                {!isDemoTenantLogin && (
                  <div>
                    <FieldLabel htmlFor="api-email" required>
                      Email address
                    </FieldLabel>
                    <IconField icon={User}>
                      <input
                        id="api-email"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        onBlur={() => persistLastEmail(email)}
                        className={FIELD_INPUT}
                        autoFocus={!email.trim()}
                        disabled={isLoading}
                        autoComplete="email"
                        aria-required
                      />
                    </IconField>
                    <FieldHelper>Use the email on your account, or your username if no email is set.</FieldHelper>
                  </div>
                )}

                {isDemoTenantLogin ? (
                  <p className="rounded-ds-md border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 text-ds-small text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100">
                    No password required. Click Sign in to explore the live demo — sample data resets daily.
                  </p>
                ) : (
                  <div>
                    <FieldLabel htmlFor="api-password" required>
                      Password
                    </FieldLabel>
                    <IconField
                      icon={Lock}
                      trailing={
                        <button
                          type="button"
                          className="absolute inset-y-0 right-0 flex items-center rounded-r-ds-md px-3 text-app-muted transition-colors hover:bg-black/[0.04] hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/40 dark:hover:bg-white/10"
                          onClick={() => setShowPassword(v => !v)}
                          tabIndex={-1}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          aria-pressed={showPassword}
                          disabled={isLoading}
                        >
                          {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                        </button>
                      }
                    >
                      <input
                        ref={passwordInputRef}
                        id="api-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className={`${FIELD_INPUT} pr-11`}
                        disabled={isLoading}
                        autoComplete="current-password"
                        aria-required
                      />
                    </IconField>
                  </div>
                )}

                {!isDemoTenantLogin && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-ds-md border border-transparent px-1 py-1 transition-colors hover:border-app-border/60">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-app-input-border text-emerald-600 focus:ring-2 focus:ring-ds-primary/35 disabled:opacity-60"
                      checked={savePassword}
                      onChange={e => setSavePassword(e.target.checked)}
                      disabled={isLoading}
                    />
                    <span className="min-w-0 text-ds-body text-app-text">
                      Save password on this device
                      <span className="mt-0.5 block text-ds-small font-normal text-app-muted">
                        Stored locally with your email. Uncheck and sign in to remove it.
                      </span>
                    </span>
                  </label>
                )}

                {(!websiteDemoEntry || displayError) && (
                <Button
                  type="submit"
                  disabled={isLoading || demoEntering}
                  className="mt-2 w-full !bg-emerald-600 hover:!bg-emerald-700 focus-visible:!ring-emerald-500"
                  aria-busy={isLoading || demoEntering}
                >
                  {isLoading || demoEntering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      {websiteDemoEntry || isDemoTenantLogin ? 'Opening live demo…' : 'Signing in…'}
                    </>
                  ) : isDemoTenantLogin ? (
                    'Enter live demo'
                  ) : (
                    'Sign in'
                  )}
                </Button>
                )}

                {!isDemoTenantLogin && !websiteDemoEntry && (
                  <>
                    <div className="relative my-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-app-border/70" aria-hidden />
                      <span className="text-ds-small text-app-muted">or</span>
                      <div className="h-px flex-1 bg-app-border/70" aria-hidden />
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={isLoading || demoEntering}
                      className="w-full"
                      onClick={async () => {
                        setError(null);
                        setDemoEntering(true);
                        try {
                          await enterDemoSession();
                        } catch (e) {
                          setError(formatApiErrorMessage(e));
                        } finally {
                          setDemoEntering(false);
                        }
                      }}
                    >
                      {demoEntering ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          Opening live demo…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" aria-hidden />
                          Try Live Demo
                        </>
                      )}
                    </Button>
                  </>
                )}

                <p className="pt-1 text-center text-ds-body text-app-muted">
                  <button
                    type="button"
                    onClick={goToRegister}
                    className="font-semibold text-emerald-700 underline-offset-2 transition-colors hover:text-emerald-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/40 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    Create a new organization
                  </button>
                </p>
              </form>
            </AuthCard>
          )}

          {view === 'register' && (
            <AuthCard className="overflow-x-hidden">
              <AuthCardHeader
                icon={Building2}
                title="Create organization"
                subtitle={
                  cloudSignup && organizationApprovalRequired
                    ? 'Submit your organization for approval. You can sign in after a platform administrator approves your request.'
                    : cloudSignup
                      ? 'Register your organization on PBooks Pro cloud'
                      : 'Register a new tenant on your API server'
                }
              />

              <form
                onSubmit={handleRegisterSubmit}
                className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2"
                autoComplete="off"
                noValidate
              >
                {displayError && (
                  <div className="md:col-span-2">
                    <AuthErrorBanner message={displayError} />
                  </div>
                )}

                {!cloudSignup && (
                  <div className="md:col-span-2">
                    <FieldLabel htmlFor="reg-server">API server (host and port)</FieldLabel>
                    <IconField icon={Server}>
                      <input
                        id="reg-server"
                        type="url"
                        value={serverUrl}
                        onChange={e => setServerUrl(e.target.value)}
                        placeholder={isStagingEnvironment() ? 'http://127.0.0.1:3001' : 'http://127.0.0.1:3000'}
                        className={FIELD_INPUT}
                        disabled={isLoading}
                        autoComplete="off"
                      />
                    </IconField>
                  </div>
                )}

                {cloudSignup && organizationApprovalRequired && (
                  <div className="md:col-span-2 rounded-ds-md border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-ds-small text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    Your registration will be reviewed in the admin portal. You will receive an email when your organization is approved.
                  </div>
                )}

                <div className="md:col-span-2 border-b border-app-border pb-1">
                  <p className="text-ds-small font-semibold uppercase tracking-wide text-app-muted">Organization</p>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="reg-company" required>
                    Company name
                  </FieldLabel>
                  <IconField icon={Building2}>
                    <input
                      id="reg-company"
                      type="text"
                      value={companyName}
                      onChange={e => setCompanyName(e.target.value)}
                      className={FIELD_INPUT}
                      disabled={isLoading}
                      required
                    />
                  </IconField>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="reg-email" required>
                    Email
                  </FieldLabel>
                  <IconField icon={User}>
                    <input
                      id="reg-email"
                      type="email"
                      value={orgEmail}
                      onChange={e => setOrgEmail(e.target.value)}
                      className={FIELD_INPUT}
                      disabled={isLoading}
                      required
                      autoComplete="email"
                    />
                  </IconField>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="reg-phone">
                    Phone <span className="font-normal text-app-muted">(optional)</span>
                  </FieldLabel>
                  <IconField icon={User}>
                    <input
                      id="reg-phone"
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      className={FIELD_INPUT}
                      disabled={isLoading}
                    />
                  </IconField>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="reg-address">
                    Address <span className="font-normal text-app-muted">(optional)</span>
                  </FieldLabel>
                  <IconField icon={Building2}>
                    <input
                      id="reg-address"
                      type="text"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className={FIELD_INPUT}
                      disabled={isLoading}
                    />
                  </IconField>
                </div>

                <div className="min-w-0 md:col-span-2">
                  <FieldLabel htmlFor="reg-tenant-id">
                    Preferred organization ID <span className="font-normal text-app-muted">(optional)</span>
                  </FieldLabel>
                  <IconField icon={Hash}>
                    <input
                      id="reg-tenant-id"
                      type="text"
                      value={requestedTenantId}
                      onChange={e => setRequestedTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="e.g. acme-corp"
                      className={`${FIELD_INPUT} font-mono text-ds-small`}
                      disabled={isLoading}
                      autoComplete="off"
                    />
                  </IconField>
                  <FieldHelper>Lowercase letters, numbers, hyphens. Leave empty to auto-generate.</FieldHelper>
                </div>

                <div className="md:col-span-2 border-b border-app-border pb-1 pt-1">
                  <p className="text-ds-small font-semibold uppercase tracking-wide text-app-muted">Admin account</p>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="reg-admin-name" required>
                    Full name
                  </FieldLabel>
                  <IconField icon={User}>
                    <input
                      id="reg-admin-name"
                      type="text"
                      value={adminName}
                      onChange={e => setAdminName(e.target.value)}
                      className={FIELD_INPUT}
                      disabled={isLoading}
                      required
                    />
                  </IconField>
                </div>

                <div className="min-w-0">
                  <FieldLabel htmlFor="reg-admin-user" required>
                    Username
                  </FieldLabel>
                  <IconField icon={User}>
                    <input
                      id="reg-admin-user"
                      type="text"
                      value={adminUsername}
                      onChange={e => setAdminUsername(e.target.value)}
                      className={FIELD_INPUT}
                      disabled={isLoading}
                      required
                      autoComplete="username"
                    />
                  </IconField>
                </div>

                <div className="min-w-0 md:col-span-2">
                  <FieldLabel htmlFor="reg-admin-pass" required>
                    Password
                  </FieldLabel>
                  <IconField
                    icon={Lock}
                    trailing={
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 flex items-center rounded-r-ds-md px-3 text-app-muted transition-colors hover:bg-black/[0.04] hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/40 dark:hover:bg-white/10"
                        onClick={() => setShowAdminPassword(v => !v)}
                        tabIndex={-1}
                        aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showAdminPassword}
                        disabled={isLoading}
                      >
                        {showAdminPassword ? (
                          <EyeOff className="h-[18px] w-[18px]" />
                        ) : (
                          <Eye className="h-[18px] w-[18px]" />
                        )}
                      </button>
                    }
                  >
                    <input
                      id="reg-admin-pass"
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      className={`${FIELD_INPUT} pr-11`}
                      disabled={isLoading}
                      autoComplete="new-password"
                      required
                    />
                  </IconField>
                </div>

                <div className="min-w-0 md:col-span-2">
                  <LegalAcceptanceCheckbox
                    key={serverUrl}
                    context="registration"
                    serverRootUrl={serverUrl}
                    checked={legalAccepted}
                    disabled={isLoading}
                    onChange={(checked, acceptances) => {
                      setLegalAccepted(checked);
                      setLegalAcceptances(acceptances);
                    }}
                  />
                </div>

                {registrationBlockers.length > 0 && (
                  <div className="md:col-span-2 rounded-ds-md border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-ds-small text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <p className="font-semibold">Complete the following to submit:</p>
                    <ul className="mt-1 list-inside list-disc space-y-0.5">
                      {registrationBlockers.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="md:col-span-2">
                  <Button
                    type="submit"
                    disabled={!canSubmitRegistration}
                    className="w-full !bg-emerald-600 hover:!bg-emerald-700 focus-visible:!ring-emerald-500 disabled:!opacity-40"
                    aria-busy={isLoading}
                    title={registrationBlockers.join('; ')}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Creating organization…
                      </>
                    ) : cloudSignup && organizationApprovalRequired ? (
                      'Submit for approval'
                    ) : (
                      'Create organization'
                    )}
                  </Button>
                </div>

                <p className="md:col-span-2 text-center">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className="inline-flex items-center gap-1.5 text-ds-body font-medium text-app-muted transition-colors hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary/40"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                    Back to sign in
                  </button>
                </p>
              </form>
            </AuthCard>
          )}
        </div>
      </main>
    </div>
  );
};

export default ApiLoginScreen;
