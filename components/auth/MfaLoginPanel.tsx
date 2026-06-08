/**
 * MFA step during login — TOTP challenge or forced setup for privileged roles.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Shield, KeyRound, ArrowLeft, Loader2, Copy, Check } from 'lucide-react';
import Button from '../ui/Button';
import { useAuth } from '../../context/AuthContext';
import { mfaApi } from '../../services/api/mfaApi';

type MfaLoginMode = 'challenge' | 'setup';

export type MfaLoginPanelProps = {
  mode: MfaLoginMode;
  mfaToken?: string;
  mfaSetupToken?: string;
  usernameForStorage: string;
  onBack: () => void;
  onComplete?: () => void;
};

export const MfaLoginPanel: React.FC<MfaLoginPanelProps> = ({
  mode,
  mfaToken,
  mfaSetupToken,
  usernameForStorage,
  onBack,
  onComplete,
}) => {
  const { verifyMfaLogin, completeMfaSetupLogin, isLoading } = useAuth();
  const [tab, setTab] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(mode === 'setup');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (mode !== 'setup' || !mfaSetupToken) return;
    let cancelled = false;
    void (async () => {
      setSetupLoading(true);
      setError(null);
      try {
        const res = await mfaApi.setup(mfaSetupToken);
        if (!cancelled) {
          setSetupSecret(res.secret);
          setOtpauthUri(res.otpauthUri);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to start MFA setup');
        }
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, mfaSetupToken]);

  const handleVerifyChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setError(null);
    try {
      await verifyMfaLogin({
        mfaToken,
        totpCode: tab === 'totp' ? code.trim() : undefined,
        recoveryCode: tab === 'recovery' ? recoveryCode.trim() : undefined,
        usernameForStorage,
      });
      onComplete?.();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : 'Verification failed';
      setError(msg);
    }
  };

  const handleEnableSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaSetupToken) return;
    setError(null);
    try {
      const { backupCodes: codes } = await completeMfaSetupLogin({
        mfaSetupToken,
        code: code.trim(),
        usernameForStorage,
      });
      setBackupCodes(codes);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error?: string }).error)
          : err instanceof Error
            ? err.message
            : 'Setup failed';
      setError(msg);
    }
  };

  const copyBackupCodes = useCallback(async () => {
    if (!backupCodes?.length) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }, [backupCodes]);

  if (backupCodes) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Save your recovery codes</p>
          <p className="mt-1 text-amber-800">
            Store these in a safe place. Each code can be used once if you lose access to your authenticator app.
          </p>
          <ul className="mt-3 space-y-1 font-mono text-xs">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void copyBackupCodes()}>
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {copied ? 'Copied' : 'Copy codes'}
          </Button>
        </div>
        <Button type="button" className="w-full" onClick={() => onComplete?.()}>
          Continue to app
        </Button>
      </div>
    );
  }

  if (mode === 'setup') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sign in
        </button>
        <div className="flex items-center gap-2 text-slate-800">
          <Shield className="h-5 w-5 text-indigo-600" />
          <h3 className="font-semibold">Set up two-factor authentication</h3>
        </div>
        <p className="text-sm text-slate-600">
          Your role requires MFA. Scan the QR code or enter the secret in Google Authenticator, Authy, or another TOTP app.
        </p>
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {setupLoading ? (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            {otpauthUri && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUri)}`}
                  alt="Authenticator QR code"
                  width={180}
                  height={180}
                  className="rounded"
                />
                {setupSecret && (
                  <p className="break-all text-center font-mono text-xs text-slate-600">{setupSecret}</p>
                )}
              </div>
            )}
            <form onSubmit={handleEnableSetup} className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                Enter the 6-digit code from your app
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
                  required
                />
              </label>
              <Button type="submit" className="w-full" disabled={isLoading || code.length < 6}>
                {isLoading ? 'Enabling…' : 'Enable MFA & sign in'}
              </Button>
            </form>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </button>
      <div className="flex items-center gap-2 text-slate-800">
        <KeyRound className="h-5 w-5 text-indigo-600" />
        <h3 className="font-semibold">Two-factor authentication</h3>
      </div>
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${tab === 'totp' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          onClick={() => setTab('totp')}
        >
          Authenticator app
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm font-medium ${tab === 'recovery' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          onClick={() => setTab('recovery')}
        >
          Recovery code
        </button>
      </div>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={handleVerifyChallenge} className="space-y-3">
        {tab === 'totp' ? (
          <label className="block text-sm font-medium text-slate-700">
            6-digit code
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base"
              required
            />
          </label>
        ) : (
          <label className="block text-sm font-medium text-slate-700">
            Recovery code
            <input
              type="text"
              autoComplete="off"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-base"
              placeholder="XXXX-XXXX-XXXX"
              required
            />
          </label>
        )}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Verifying…' : 'Verify & sign in'}
        </Button>
      </form>
    </div>
  );
};

export default MfaLoginPanel;
