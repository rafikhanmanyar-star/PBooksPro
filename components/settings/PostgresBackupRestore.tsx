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
} from 'lucide-react';
import {
  fetchDatabaseBackupCapabilities,
  downloadPostgresBackup,
  restorePostgresBackup,
  type DatabaseBackupCapabilities,
} from '../../services/databaseBackupService';

const PostgresBackupRestore: React.FC = () => {
  const [caps, setCaps] = useState<DatabaseBackupCapabilities | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const loadCaps = useCallback(async () => {
    setLoadError(null);
    try {
      const c = await fetchDatabaseBackupCapabilities();
      setCaps(c);
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
      await downloadPostgresBackup();
      setMessage({ type: 'success', text: 'Backup downloaded. Store this file in a safe place.' });
    } catch (e) {
      setMessage({
        type: 'error',
        text: e instanceof Error ? e.message : 'Backup failed.',
      });
    } finally {
      setBackingUp(false);
    }
  };

  const handleFileChange = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.dump') && !file.name.toLowerCase().endsWith('.backup')) {
      setMessage({
        type: 'warning',
        text: 'Select a PostgreSQL custom-format backup (.dump) created by PBooks or pg_dump -Fc.',
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
      const msg = await restorePostgresBackup(file);
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

  const busy = backingUp || restoring;

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
          Download a full snapshot of the database used by this API server, or restore from a previous <code className="text-xs bg-gray-100 px-1 rounded">.dump</code> file.
        </p>
      </div>

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

      <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-900">
        The API server must have <strong>pg_dump</strong> and <strong>pg_restore</strong> (PostgreSQL client tools) installed and on <strong>PATH</strong>. Restore replaces the <strong>entire</strong> database for this server.
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
              Download backup (.dump)
            </>
          )}
        </button>

        <label
          className={`flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium transition-colors ${
            busy ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-50 cursor-pointer'
          }`}
        >
          <Upload className="w-4 h-4" />
          {restoring ? 'Restoring…' : 'Restore from file'}
          <input type="file" accept=".dump,.backup,application/octet-stream" className="hidden" onChange={handleFileChange} disabled={busy} />
        </label>
      </div>
    </div>
  );
};

export default PostgresBackupRestore;
