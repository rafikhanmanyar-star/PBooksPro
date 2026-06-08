import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, Save, Wifi, Shield, KeyRound } from 'lucide-react';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';
import {
  backupStorageApi,
  STORAGE_PROVIDER_OPTIONS,
  type BackupStorageSettings,
  type StorageProviderId,
} from '../../services/api/backupStorageApi';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

const BackupStorageSettingsPage: React.FC = () => {
  const { has } = usePermissions();
  const { showNotification } = useNotification();
  const canRead = has('backups.read');
  const canManage = has('backups.manage');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [endpointHint, setEndpointHint] = useState('');

  const [provider, setProvider] = useState<StorageProviderId>('aws_s3');
  const [bucketName, setBucketName] = useState('');
  const [region, setRegion] = useState('');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [autoUpload, setAutoUpload] = useState(true);
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [masked, setMasked] = useState<{ access: string; secret: string; hasAccess: boolean; hasSecret: boolean }>({
    access: '',
    secret: '',
    hasAccess: false,
    hasSecret: false,
  });

  const applySettings = useCallback((s: BackupStorageSettings, hint: string) => {
    setProvider(s.provider);
    setBucketName(s.bucketName);
    setRegion(s.region ?? '');
    setEndpointUrl(s.endpointUrl ?? '');
    setEnabled(s.enabled);
    setAutoUpload(s.autoUpload);
    setEndpointHint(hint);
    setMasked({
      access: s.accessKeyMasked,
      secret: s.secretKeyMasked,
      hasAccess: s.hasAccessKey,
      hasSecret: s.hasSecretKey,
    });
    setAccessKey('');
    setSecretKey('');
  }, []);

  const load = useCallback(async () => {
    if (isLocalOnlyMode() || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await backupStorageApi.getSettings();
      applySettings(res.settings, res.endpointHint);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load storage settings.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canRead, applySettings, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsEndpoint = provider === 'cloudflare_r2' || provider === 'backblaze_b2';
  const isAzure = provider === 'azure_blob';

  const payload = useMemo(
    () => ({
      provider,
      bucketName,
      region: region || null,
      endpointUrl: endpointUrl || null,
      enabled,
      autoUpload,
      ...(accessKey.trim() ? { accessKey: accessKey.trim() } : {}),
      ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
    }),
    [provider, bucketName, region, endpointUrl, enabled, autoUpload, accessKey, secretKey]
  );

  const handleSave = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      const res = await backupStorageApi.saveSettings(payload);
      applySettings(res.settings, endpointHint);
      showNotification('Storage settings saved.', 'success');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!canManage) return;
    setTesting(true);
    try {
      const res = await backupStorageApi.testConnection(payload);
      showNotification(res.message, 'success');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Connection test failed.', 'error');
    } finally {
      setTesting(false);
    }
  };

  if (isLocalOnlyMode()) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-2xl mx-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Offsite storage settings are available in LAN / server mode with PostgreSQL.
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-2xl mx-auto rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You do not have permission to view backup storage settings.
        </div>
      </div>
    );
  }

  if (loading) {
    return <p className="p-6 text-sm text-slate-500">Loading storage settings…</p>;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-sky-600" />
            Offsite Storage
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Configure cloud backup storage. Files are encrypted (AES-256-GCM) before upload and verified by checksum.
          </p>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-900 flex gap-2">
          <Shield className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            Set <code className="bg-white/70 px-1 rounded">BACKUP_ENCRYPTION_KEY</code> and{' '}
            <code className="bg-white/70 px-1 rounded">BACKUP_STORAGE_MASTER_KEY</code> on the API server.
            Credentials stored in the database are encrypted at rest.
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Select
            label="Storage provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as StorageProviderId)}
            disabled={!canManage}
          >
            {STORAGE_PROVIDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>

          <Input
            label={isAzure ? 'Container name' : 'Bucket name'}
            value={bucketName}
            onChange={(e) => setBucketName(e.target.value)}
            disabled={!canManage}
            placeholder={isAzure ? 'backups' : 'my-pbooks-backups'}
          />

          <Input
            label={isAzure ? 'Storage account name' : 'Access key / ID'}
            value={accessKey}
            onChange={(e) => setAccessKey(e.target.value)}
            disabled={!canManage}
            placeholder={masked.hasAccess ? `Saved (${masked.access})` : 'Access key ID'}
          />

          <Input
            label={isAzure ? 'Account key' : 'Secret key'}
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            disabled={!canManage}
            placeholder={masked.hasSecret ? `Saved (${masked.secret})` : 'Secret access key'}
          />

          <Input
            label={isAzure ? 'Endpoint suffix (optional)' : 'Region'}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={!canManage}
            placeholder={isAzure ? 'core.windows.net' : 'us-east-1'}
          />

          {(needsEndpoint || isAzure) && (
            <div>
              <Input
                label={needsEndpoint ? 'S3-compatible endpoint URL' : 'Custom endpoint URL (optional)'}
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                disabled={!canManage}
                placeholder={endpointHint}
              />
              {endpointHint && (
                <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                  <KeyRound className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {endpointHint}
                </p>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={!canManage}
              className="rounded border-slate-300"
            />
            Enable offsite uploads
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={autoUpload}
              onChange={(e) => setAutoUpload(e.target.checked)}
              disabled={!canManage}
              className="rounded border-slate-300"
            />
            Upload automatically after each scheduled backup
          </label>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleSave()} disabled={saving || testing}>
              <Save className="w-4 h-4 mr-1.5" />
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
            <Button variant="secondary" onClick={() => void handleTest()} disabled={saving || testing}>
              <Wifi className="w-4 h-4 mr-1.5" />
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupStorageSettingsPage;
