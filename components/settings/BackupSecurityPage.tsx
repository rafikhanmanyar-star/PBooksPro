import React, { useCallback, useEffect, useState } from 'react';
import { Shield, Key, Lock, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';
import {
  backupSecurityApi,
  type BackupSecuritySettings,
  type BackupSecurityStatus,
  type RestorePolicy,
} from '../../services/api/backupSecurityApi';
import Button from '../ui/Button';

const BackupSecurityPage: React.FC = () => {
  const { has } = usePermissions();
  const { showNotification } = useNotification();
  const canRead = has('backups.read');
  const canManage = has('backups.manage');

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<BackupSecurityStatus | null>(null);
  const [settings, setSettings] = useState<BackupSecuritySettings | null>(null);
  const [restorePolicy, setRestorePolicy] = useState<RestorePolicy | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (isLocalOnlyMode() || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [st, pol] = await Promise.all([
        backupSecurityApi.getStatus(),
        backupSecurityApi.getRestorePolicy(),
      ]);
      setStatus(st);
      setSettings(st.settings);
      setRestorePolicy(pol);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load security settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canRead, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const saved = await backupSecurityApi.updateSettings({
        encrypt_at_rest: settings.encrypt_at_rest,
        encrypt_before_upload: settings.encrypt_before_upload,
        require_restore_authorization: settings.require_restore_authorization,
        min_backup_password_length: settings.min_backup_password_length,
      });
      setSettings(saved);
      showNotification('Security settings saved.', 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Save failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const rotateKey = async () => {
    if (
      !confirm(
        'Increment key version? You must update BACKUP_ENCRYPTION_KEY on the server to complete rotation.'
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await backupSecurityApi.rotateKey();
      showNotification(res.message, 'success');
      await load();
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Key rotation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (isLocalOnlyMode()) {
    return (
      <div className="p-6 text-center text-slate-600">
        Backup Security requires the API server (PostgreSQL mode).
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-6 text-center text-slate-600">
        You do not have permission to view backup security settings.
      </div>
    );
  }

  if (loading && !status) {
    return (
      <div className="p-8 flex justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Shield className="w-6 h-6 text-indigo-600" />
          Backup Security
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          AES-256-GCM encryption at rest and before cloud upload. Restore is restricted to Super Admin
          and Company Admin with authorization tokens.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-xs uppercase text-slate-500 font-medium mb-1">Algorithm</div>
          <div className="text-lg font-semibold">{status?.encryptionAlgorithm ?? 'AES-256-GCM'}</div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-xs uppercase text-slate-500 font-medium mb-1">Server Key</div>
          <div className="flex items-center gap-2">
            {status?.serverKeyConfigured ? (
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            )}
            <span>{status?.serverKeyConfigured ? 'Configured' : 'Not configured'}</span>
          </div>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="text-xs uppercase text-slate-500 font-medium mb-1">Key Version</div>
          <div className="text-lg font-semibold">v{settings?.key_version ?? 1}</div>
          {settings?.key_rotated_at && (
            <div className="text-xs text-slate-400 mt-1">
              Rotated {new Date(settings.key_rotated_at).toLocaleString()}
            </div>
          )}
        </div>
      </div>

      {restorePolicy && (
        <div
          className={`p-4 rounded-xl border ${
            restorePolicy.canRestore
              ? 'border-emerald-200 bg-emerald-50/50'
              : 'border-amber-200 bg-amber-50/50'
          }`}
        >
          <div className="flex items-center gap-2 font-medium text-slate-800">
            <Lock className="w-5 h-5" />
            Restore authorization
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {restorePolicy.canRestore
              ? `Your role (${restorePolicy.role}) may restore backups.`
              : 'Your role cannot restore backups. Only Super Admin and Company Admin can restore.'}
            {restorePolicy.requireRestoreAuthorization &&
              ' A short-lived authorization token is required before restore.'}
          </p>
        </div>
      )}

      {canManage && settings && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-500" />
            Encryption &amp; key management
          </h3>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.encrypt_at_rest}
              onChange={(e) => setSettings({ ...settings, encrypt_at_rest: e.target.checked })}
            />
            Encrypt backups before local storage (PBKENC1)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.encrypt_before_upload}
              onChange={(e) => setSettings({ ...settings, encrypt_before_upload: e.target.checked })}
            />
            Encrypt before cloud upload
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.require_restore_authorization}
              onChange={(e) =>
                setSettings({ ...settings, require_restore_authorization: e.target.checked })
              }
            />
            Require restore authorization token
          </label>

          <div>
            <label className="block text-sm text-slate-600 mb-1">Minimum backup password length</label>
            <input
              type="number"
              min={8}
              max={128}
              className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              value={settings.min_backup_password_length}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  min_backup_password_length: Number(e.target.value) || 8,
                })
              }
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => void saveSettings()}>
              Save Settings
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void rotateKey()}>
              Rotate Key Version
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            Set <code className="bg-slate-100 px-1 rounded">BACKUP_ENCRYPTION_KEY</code> and{' '}
            <code className="bg-slate-100 px-1 rounded">BACKUP_STORAGE_MASTER_KEY</code> in the API
            server environment. Formats: {status?.formats.join(', ')}.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-800 mb-2">Audit trail</h3>
        <p className="text-sm text-slate-600">
          Backup events are logged to the enterprise audit trail (module: backups): created,
          downloaded, restored, and deleted. View them under Settings → Audit Trail, filtered by
          module &quot;backups&quot;.
        </p>
      </section>
    </div>
  );
};

export default BackupSecurityPage;
