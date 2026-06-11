/**
 * MFA settings — enable, disable, and status for API mode users.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Loader2, Copy, Check } from 'lucide-react';
import Button from '../ui/Button';
import { mfaApi, type MfaStatus } from '../../services/api/mfaApi';
import { useAuth } from '../../context/AuthContext';

const MfaSettingsSection: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [enableCode, setEnableCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await mfaApi.getStatus();
      setStatus(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load MFA status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  const startSetup = async () => {
    setBusy(true);
    setError(null);
    setBackupCodes(null);
    try {
      const res = await mfaApi.setup();
      setSetupSecret(res.secret);
      setOtpauthUri(res.otpauthUri);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start setup');
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await mfaApi.enable(enableCode.trim());
      setBackupCodes(res.backupCodes);
      setSetupSecret(null);
      setOtpauthUri(null);
      setEnableCode('');
      await loadStatus();
      flash('Multi-factor authentication enabled.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await mfaApi.disable(disableCode.trim());
      setDisableCode('');
      await loadStatus();
      flash('Multi-factor authentication disabled.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const copyBackupCodes = async () => {
    if (!backupCodes?.length) return;
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-app-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <Shield className="mt-1 h-6 w-6 text-ds-primary" />
        <div>
          <h3 className="text-lg font-semibold text-app-text">Multi-factor authentication</h3>
          <p className="mt-1 text-sm text-app-muted">
            Use an authenticator app (Google Authenticator, Authy, etc.) for an extra layer of security.
            {status?.required && (
              <span className="block mt-1 font-medium text-ds-warning">
                Required for your role ({user?.role}).
              </span>
            )}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {status && (
        <div className="rounded-lg border border-app-border bg-app-bg px-4 py-3 text-sm">
          <p>
            Status:{' '}
            <span className={status.enabled ? 'font-semibold text-emerald-700' : 'font-semibold text-app-muted'}>
              {status.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </p>
          {status.enabled && (
            <p className="mt-1 text-app-muted">Recovery codes remaining: {status.backupCodesRemaining}</p>
          )}
        </div>
      )}

      {backupCodes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-ds-warning">Save these recovery codes now</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {backupCodes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => void copyBackupCodes()}>
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      )}

      {!status?.enabled && !otpauthUri && (
        <Button type="button" onClick={() => void startSetup()} disabled={busy}>
          {busy ? 'Starting…' : 'Set up authenticator app'}
        </Button>
      )}

      {otpauthUri && !status?.enabled && (
        <div className="space-y-4 rounded-xl border border-app-border p-4">
          <p className="text-sm text-app-muted">Scan with your authenticator app, then enter the verification code.</p>
          <div className="flex flex-col items-center">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(otpauthUri)}`}
              alt="QR code"
              width={160}
              height={160}
            />
            {setupSecret && (
              <p className="mt-2 break-all text-center font-mono text-xs text-app-muted">{setupSecret}</p>
            )}
          </div>
          <form onSubmit={confirmEnable} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-sm">
              Verification code
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={enableCode}
                onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ''))}
                className="mt-1 block w-full rounded-md border border-app-border px-3 py-2"
                required
              />
            </label>
            <Button type="submit" disabled={busy || enableCode.length < 6}>
              Enable MFA
            </Button>
          </form>
        </div>
      )}

      {status?.enabled && !status.required && (
        <form onSubmit={handleDisable} className="space-y-3 rounded-xl border border-app-border p-4">
          <p className="text-sm text-app-muted">Enter your current authenticator code to disable MFA.</p>
          <input
            type="text"
            inputMode="numeric"
            maxLength={8}
            value={disableCode}
            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
            className="block w-full max-w-xs rounded-md border border-app-border px-3 py-2"
            required
          />
          <Button type="submit" variant="secondary" disabled={busy || disableCode.length < 6}>
            Disable MFA
          </Button>
        </form>
      )}

      {status?.enabled && status.required && (
        <p className="text-sm text-app-muted">
          MFA cannot be disabled while it is required for your role.
        </p>
      )}
    </div>
  );
};

export default MfaSettingsSection;
