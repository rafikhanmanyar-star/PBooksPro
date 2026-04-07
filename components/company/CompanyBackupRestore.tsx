/**
 * Company Backup & Restore
 * Per-company backup/restore UI using the companyBridge IPC.
 *
 * Before backup we flush all in-memory app state to SQLite (save-state-before-backup)
 * so that agreements, invoices, and other recently created/edited data are included.
 * We also flush subsystems that use localStorage as primary store (payroll).
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useCompany, BackupInfo } from '../../context/CompanyContext';
import { isLocalOnlyMode } from '../../config/apiUrl';
import {
  Database, Download, Upload, Clock, HardDrive,
  CheckCircle, AlertCircle, RefreshCw, FileUp, AlertTriangle
} from 'lucide-react';
import { storageService } from '../payroll/services/storageService';
import { persistPayrollToDbInOrder } from '../payroll/services/payrollDb';

/**
 * Flush all app state to SQLite before backup so no data is lost.
 * 1) Triggers save-state-before-backup so AppContext persists full state (agreements, invoices, etc.).
 * 2) Flushes subsystem data that lives in localStorage (payroll).
 */
async function flushAllStateToDbBeforeBackup(): Promise<void> {
  // 1. Flush main app state (agreements, invoices, contacts, etc.) to SQLite
  await new Promise<void>((resolve) => {
    const handleDone = () => {
      window.removeEventListener('state-saved-for-backup', handleDone);
      resolve();
    };
    window.addEventListener('state-saved-for-backup', handleDone);
    window.dispatchEvent(new CustomEvent('save-state-before-backup'));
    setTimeout(() => {
      window.removeEventListener('state-saved-for-backup', handleDone);
      resolve();
    }, 15000);
  });

  // 2. Flush payroll (localStorage) to SQLite
  const tenantId = 'local';
  try {
    const runs = storageService.getPayrollRuns(tenantId);
    const employees = storageService.getEmployees(tenantId);
    const payslips = storageService.getPayslips(tenantId);
    const departments = storageService.getDepartments(tenantId);
    const grades = storageService.getGradeLevels(tenantId);
    await persistPayrollToDbInOrder(tenantId, runs, employees, payslips, departments, grades);
  } catch (err) {
    console.warn('[CompanyBackupRestore] Payroll flush failed (non-critical):', err);
  }
}

const CompanyBackupRestore: React.FC = () => {
  const { activeCompany, backupCompany, listBackups, restoreBackup, selectBackupFile } = useCompany();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  const loadBackups = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const result = await listBackups(activeCompany.id);
      setBackups(result);
    } catch (err) {
      console.error('[CompanyBackupRestore] Load backups error:', err);
    } finally {
      setLoading(false);
    }
  }, [activeCompany, listBackups]);

  useEffect(() => {
    loadBackups();
  }, [loadBackups]);

  if (!isLocalOnlyMode() || !activeCompany) return null;

  const handleBackup = async () => {
    setBackingUp(true);
    setMessage(null);
    try {
      await flushAllStateToDbBeforeBackup();
      // Ensure main process has flushed WAL into the main .db file so backup includes all in-memory transactions
      const prep = await window.companyBridge!.prepareForBackup(activeCompany.id);
      if (!prep.ok) {
        setMessage({ type: 'warning', text: prep.error || 'Could not flush database; backup may be incomplete.' });
      }
      const result = await backupCompany(activeCompany.id);
      if (result.ok) {
        setMessage({ type: 'success', text: `Backup created: ${result.backup?.name}` });
        await loadBackups();
      } else {
        setMessage({ type: 'error', text: result.error || 'Backup failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Backup failed.' });
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestore = async (backupPath: string) => {
    if (!confirm('Restore this backup? This will overwrite the current company data. The app will reload.')) return;
    setRestoring(true);
    setMessage(null);
    try {
      const result = await restoreBackup(backupPath);
      if (!result.ok) {
        const isFileInUse = result.error === 'DATABASE_FILE_IN_USE';
        const friendlyText = isFileInUse
          ? 'The company database is open in another application. Close it (e.g. DBeaver, Excel, or another PBooks instance) and try again.'
          : (result.error || 'Restore failed.');
        setMessage({ type: 'error', text: friendlyText });
        if (isFileInUse) {
          window.alert(
            'Cannot restore backup — database file is in use.\n\n' +
            'Please close any application that has this company\'s database open (e.g. DBeaver, another database tool, or another instance of PBooks Pro), then try Restore again.'
          );
        }
        setRestoring(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Restore failed.' });
      setRestoring(false);
    }
  };

  const handleImportBackup = async () => {
    const result = await selectBackupFile();
    if (!result.ok || !result.filePath) return;
    await handleRestore(result.filePath);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const isBusy = backingUp || restoring;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-green-600" />
            Company Backup
          </h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {activeCompany.company_name} &middot; {activeCompany.slug}.db
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadBackups}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Refresh backup list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-3 rounded-lg flex items-start gap-2 ${
          message.type === 'success' ? 'bg-green-50 border border-green-200'
            : message.type === 'warning' ? 'bg-amber-50 border border-amber-200'
            : 'bg-red-50 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
          ) : message.type === 'warning' ? (
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          )}
          <p className={`text-sm ${
            message.type === 'success' ? 'text-green-700'
              : message.type === 'warning' ? 'text-amber-700'
              : 'text-red-700'
          }`}>
            {message.text}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleBackup}
          disabled={isBusy}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
          title="Create a full snapshot of all company data (database and payroll) and save it to the backups folder"
        >
          {backingUp ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Backing up...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Backup Now
            </>
          )}
        </button>
        <button
          onClick={handleImportBackup}
          disabled={isBusy}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          title="Browse for a backup file (.db) from another PC or USB drive to restore"
        >
          <FileUp className="w-4 h-4" />
          Import Backup File
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-gray-400">
        <strong>Backup Now</strong> saves a full copy of all company data to the backups folder. Use <strong>Import Backup File</strong> on any PC running the same app version to restore from a backup file.
      </p>

      {/* Backup list */}
      {backups.length > 0 && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Available Backups ({backups.length})
            </p>
          </div>
          <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
            {backups.map((backup) => (
              <div key={backup.name} className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-50">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <HardDrive className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{backup.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(backup.createdAt)}
                      </span>
                      <span>{formatSize(backup.size)}</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(backup.path)}
                  disabled={restoring}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3 h-3" />
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {backups.length === 0 && !loading && (
        <p className="text-sm text-gray-400 text-center py-4">No backups found for this company.</p>
      )}
    </div>
  );
};

export default CompanyBackupRestore;
