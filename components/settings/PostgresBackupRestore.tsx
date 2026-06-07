/**
 * Full PostgreSQL backup/restore for LAN/API mode (server runs pg_dump / pg_restore).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Download,
  Upload,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import {
  fetchDatabaseBackupCapabilities,
  downloadPostgresBackup,
  downloadTenantBackup,
  restorePostgresBackup,
  type DatabaseBackupCapabilities,
} from '../../services/databaseBackupService';
import {
  backupSecurityApi,
  type RestorePolicy,
} from '../../services/api/backupSecurityApi';

const PostgresBackupRestore: React.FC = () => {
  const [caps, setCaps] = useState<DatabaseBackupCapabilities | null>(null);
  const [restorePolicy, setRestorePolicy] = useState<RestorePolicy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backingUpTenant, setBackingUpTenant] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [useBackupPassword, setUseBackupPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const loadCaps = useCallback(async () => {
    setLoadError(null);
    try {
      const [c, pol] = await Promise.all([
        fetchDatabaseBackupCapabilities(),
        backupSecurityApi.getRestorePolicy().catch(() => null),
      ]);
      setCaps(c);
      setRestorePolicy(pol);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
      setCaps(null);
    }
  }, []);

  useEffect(() => {
    loadCaps();
  }, [loadCaps]);

  const handleBackup = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      await downloadPostgresBackup({
        password: useBackupPassword ? backupPassword : undefined,
      });
      setMessage({
        type: 'success',
        text: useBackupPassword
          ? 'Password-protected encrypted backup downloaded. Store the password securely.'
          : 'AES-256 encrypted backup downloaded. Store this file in a safe place.',
      });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Backup failed.',
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleTenantBackup = async () => {
    setBackingUpTenant(true);
    setMessage(null);
    try {
      await downloadTenantBackup();
      setMessage({ type: 'success', text: 'Organization backup downloaded (JSON, gzip). Use Tenant Restore to import.' });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Tenant backup failed.',
      });
    } finally {
      setBackingUpTenant(false);
    }
  };

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;

    const lower = file.name.toLowerCase();
    const validExt =
      lower.endsWith('.dump') ||
      lower.endsWith('.backup') ||
      lower.endsWith('.pbkenc') ||
      lower.endsWith('.pbkenc2');
    if (!validExt) {
      setMessage({
        type: 'warning',
        text: 'Select a PBooks backup (.pbkenc, .pbkenc2) or PostgreSQL custom-format (.dump) file.',
      });
      return;
    }

    if (!restorePolicy?.canRestore) {
      setMessage({
        type: 'error',
        text: 'Only Super Admin and Company Admin can restore backups.',
      });
      return;
    }

    if (
      !confirm(
        'Restore will replace the entire PostgreSQL database used by this API server (all organizations on this server). All connected users should save work and reconnect after reload. Continue?'
      )
    ) {
      return;
    }

    setRestoring(true);
    setMessage(null);
    try {
      let restoreToken: string | undefined;
      if (restorePolicy.requireRestoreAuthorization) {
        const phrase = prompt(
          `Type "${restorePolicy.confirmPhrase}" to authorize restore:`,
          ''
        );
        if (!phrase) {
          setRestoring(false);
          return;
        }
        const auth = await backupSecurityApi.authorizeRestore(phrase);
        restoreToken = auth.restoreToken;
      }

      const msg = await restorePostgresBackup(file, {
        restoreToken,
        backupPassword: restorePassword || undefined,
      });
      setMessage({ type: 'success', text: msg });
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Restore failed.',
      });
      setRestoring(false);
    }
  };

  const busy = backingUp || backingUpTenant || restoring;

  if (loadError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-medium">Could not load backup settings</p>
            <p className="mt-1 text-amber-800">{loadError}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!caps) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (!caps.backupRestoreEnabled) {
    return (
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-green-600" />
          PostgreSQL backup
        </h3>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {caps.hint}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <Database className="w-5 h-5 text-green-600" />
          PostgreSQL backup
        </h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Downloads are AES-256 encrypted ({caps.encryptedFormat ?? 'PBKENC'}). Optional backup password
          adds an extra layer for offline storage. Restore requires Super Admin or Company Admin
          authorization.
        </p>
      </div>

      {restorePolicy && (
        <div
          className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
            restorePolicy.canRestore
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <Lock className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            {restorePolicy.canRestore
              ? 'You are authorized to restore (Super Admin / Company Admin).'
              : 'Restore is disabled for your role. Contact an administrator.'}
          </div>
        </div>
      )}

      {message && (
        <div
          className={`p-3 rounded-lg flex items-start gap-2 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : message.type === 'warning'
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-red-50 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : message.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <p
            className={`text-sm ${
              message.type === 'success'
                ? 'text-green-700'
                : message.type === 'warning'
                  ? 'text-amber-700'
                  : 'text-red-700'
            }`}
          >
            {message.text}
          </p>
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-900 space-y-1">
        <p>
          The API server must have <strong>pg_dump</strong> and <strong>pg_restore</strong> on{' '}
          <strong>PATH</strong>.
        </p>
        <p>
          Backups are encrypted with AES-256-GCM before download and local storage. Set{' '}
          <code className="bg-white/80 px-1 rounded">BACKUP_ENCRYPTION_KEY</code> on the server.
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3 space-y-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={useBackupPassword}
            onChange={(e) => setUseBackupPassword(e.target.checked)}
          />
          Protect download with backup password (PBKENC2)
        </label>
        {useBackupPassword && (
          <input
            type="password"
            className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Backup password (min 8 characters)"
            value={backupPassword}
            onChange={(e) => setBackupPassword(e.target.value)}
          />
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleBackup}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {backingUp ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Preparing backup…
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download encrypted backup
            </>
          )}
        </button>

        {caps.tenantBackupEnabled !== false && (
          <button
            type="button"
            onClick={handleTenantBackup}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {backingUpTenant ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Exporting organization…
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export this organization (.json.gz)
              </>
            )}
          </button>
        )}

        {restorePolicy?.canRestore && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Backup file password (if any)"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
            />
            <label
              className={`flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors ${
                busy ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-50 cursor-pointer'
              }`}
            >
              <Upload className="w-4 h-4" />
              {restoring ? 'Restoring…' : 'Secure restore'}
              <input
                type="file"
                accept=".dump,.backup,.pbkenc,.pbkenc2,application/octet-stream"
                className="hidden"
                onChange={handleFileChange}
                disabled={busy}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostgresBackupRestore;
