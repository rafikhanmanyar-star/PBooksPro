import React, { useState } from 'react';
import {
  Upload,
  FileSearch,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Building2,
} from 'lucide-react';
import { isLocalOnlyMode } from '../../config/apiUrl';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';
import {
  tenantBackupApi,
  type ConflictPolicy,
  type RestoreMode,
  type RestorePreview,
} from '../../services/api/tenantBackupApi';
import { backupSecurityApi } from '../../services/api/backupSecurityApi';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';

type WizardStep = 'upload' | 'options' | 'preview' | 'done';

const TABLE_LABELS: Record<string, string> = {
  contacts: 'Customers & contacts',
  vendors: 'Vendors',
  accounts: 'Accounts',
  transactions: 'Transactions',
  invoices: 'Invoices',
  projects: 'Projects',
  bills: 'Bills',
  categories: 'Categories',
  payroll_departments: 'Payroll departments',
  payroll_grades: 'Payroll grades',
  payroll_employees: 'Payroll employees',
  payroll_runs: 'Payroll runs',
  payslips: 'Payslips',
  payroll_tenant_config: 'Payroll config',
  journal_entries: 'Journal entries',
  journal_lines: 'Journal lines',
};

const TenantRestoreWizard: React.FC = () => {
  const { has } = usePermissions();
  const { showNotification } = useNotification();
  const canRead = has('backups.read');
  const canManage = has('backups.manage');

  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<RestoreMode>('existing_tenant');
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('replace');
  const [newTenantName, setNewTenantName] = useState('');
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoreResult, setRestoreResult] = useState<string | null>(null);

  const reset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setRestoreResult(null);
    setMode('existing_tenant');
    setConflictPolicy('replace');
    setNewTenantName('');
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith('.json.gz') && !f.name.endsWith('.gz') && !f.name.endsWith('.json')) {
      showNotification('Select a tenant backup (.json.gz) exported from PBooks.', 'warning');
      return;
    }
    setFile(f);
    setStep('options');
  };

  const runPreview = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const result = await tenantBackupApi.validateRestore({
        file,
        mode,
        conflictPolicy,
        newTenantName: mode === 'new_tenant' ? newTenantName : undefined,
      });
      setPreview(result);
      setStep('preview');
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Validation failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runRestore = async () => {
    if (!file || !preview?.canProceed) return;
    if (
      !confirm(
        mode === 'existing_tenant'
          ? 'Restore will merge/replace data in your current organization. This runs in a transaction and rolls back on failure. Continue?'
          : `Create new organization "${preview.targetTenantName}" and import backup data?`
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const policy = await backupSecurityApi.getRestorePolicy();
      if (!policy.canRestore) {
        showNotification('Only Super Admin and Company Admin can restore backups.', 'error');
        return;
      }
      let restoreToken: string | undefined;
      if (policy.requireRestoreAuthorization) {
        const phrase = prompt(
          `Type "${policy.confirmPhrase}" to authorize restore:`,
          ''
        );
        if (!phrase) return;
        const auth = await backupSecurityApi.authorizeRestore(phrase);
        restoreToken = auth.restoreToken;
      }

      const result = await tenantBackupApi.executeRestore({
        file,
        mode,
        conflictPolicy,
        newTenantName: mode === 'new_tenant' ? newTenantName : undefined,
        restoreToken,
      });
      setRestoreResult(
        mode === 'new_tenant'
          ? `Restore complete. New organization: ${result.targetTenantName} (${result.targetTenantId}). Switch organization in admin settings to use it.`
          : 'Restore complete. Reload the application to see imported data.'
      );
      setStep('done');
      if (mode === 'existing_tenant') {
        setTimeout(() => window.location.reload(), 2500);
      }
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Restore failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (isLocalOnlyMode()) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-2xl mx-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Tenant restore is available in LAN / server mode. Use company backup for local SQLite installs.
        </div>
      </div>
    );
  }

  if (!canRead) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-2xl mx-auto rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You need backup permissions to use tenant restore.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            Tenant Restore Wizard
          </h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Restore customers, vendors, accounts, transactions, invoices, projects, bills, and payroll
            for one organization — without replacing the entire database.
          </p>
        </div>

        <div className="flex gap-2 text-xs">
          {(['upload', 'options', 'preview', 'done'] as WizardStep[]).map((s, i) => (
            <span
              key={s}
              className={`px-2 py-1 rounded ${step === s ? 'bg-indigo-100 text-indigo-800 font-medium' : 'bg-slate-100 text-slate-500'}`}
            >
              {i + 1}. {s === 'upload' ? 'Upload' : s === 'options' ? 'Options' : s === 'preview' ? 'Preview' : 'Done'}
            </span>
          ))}
        </div>

        {step === 'upload' && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Upload className="w-10 h-10 mx-auto text-slate-400 mb-3" />
            <p className="text-sm text-slate-600 mb-4">Upload a tenant backup file (.json.gz)</p>
            <label className="inline-flex cursor-pointer items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Choose file
              <input
                type="file"
                accept=".json.gz,.gz,application/gzip,application/json"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

        {step === 'options' && file && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">
              File: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </p>

            <Select label="Restore mode" value={mode} onChange={(e) => setMode(e.target.value as RestoreMode)}>
              <option value="existing_tenant">Restore into current organization</option>
              <option value="new_tenant">Restore into new organization</option>
            </Select>

            {mode === 'new_tenant' && (
              <Input
                label="New organization name"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                placeholder="Restored company name"
              />
            )}

            <Select
              label="Conflict policy"
              value={conflictPolicy}
              onChange={(e) => setConflictPolicy(e.target.value as ConflictPolicy)}
            >
              <option value="replace">Replace existing records (upsert)</option>
              <option value="skip">Skip existing records</option>
              <option value="merge">Merge — skip duplicates (same as skip)</option>
            </Select>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={() => void runPreview()} disabled={loading}>
                <FileSearch className="w-4 h-4 mr-1.5" />
                {loading ? 'Validating…' : 'Validate & preview'}
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div
              className={`rounded-lg p-4 border ${preview.canProceed ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}
            >
              <p className="font-medium text-slate-800 flex items-center gap-2">
                {preview.canProceed ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
                Validation {preview.canProceed ? 'passed' : 'has blocking issues'}
              </p>
              <p className="text-sm text-slate-600 mt-1">
                Source: {preview.sourceTenantName ?? preview.sourceTenantId} · Exported{' '}
                {new Date(preview.exportedAt).toLocaleString()} · {preview.totalRecords} records
              </p>
              <p className="text-sm text-slate-600">
                Target: {preview.targetTenantName ?? preview.targetTenantId} ({preview.mode.replace('_', ' ')})
              </p>
            </div>

            {preview.issues.length > 0 && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b text-xs font-medium text-slate-600 uppercase">
                  Validation report
                </div>
                <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto text-sm">
                  {preview.issues.map((issue, idx) => (
                    <li key={`${issue.code}-${idx}`} className="px-3 py-2 flex gap-2">
                      {issue.severity === 'error' ? (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : issue.severity === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      ) : (
                        <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                      <span className="text-slate-700">{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b text-xs font-medium text-slate-600 uppercase">
                Restore preview
              </div>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-slate-500">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Total</th>
                    <th className="px-3 py-2">Insert</th>
                    <th className="px-3 py-2">Update</th>
                    <th className="px-3 py-2">Skip</th>
                    <th className="px-3 py-2">Conflicts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {preview.tableSummaries.map((row) => (
                    <tr key={row.table}>
                      <td className="px-3 py-2">{TABLE_LABELS[row.table] ?? row.table}</td>
                      <td className="px-3 py-2">{row.total}</td>
                      <td className="px-3 py-2 text-green-700">{row.toInsert}</td>
                      <td className="px-3 py-2 text-blue-700">{row.toUpdate}</td>
                      <td className="px-3 py-2 text-slate-500">{row.toSkip}</td>
                      <td className="px-3 py-2 text-red-700">{row.crossTenantConflicts || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3 text-xs text-blue-900">
              Restore runs inside a database transaction. If any step fails, all changes are rolled back automatically.
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep('options')}>
                Back
              </Button>
              {canManage && (
                <Button
                  onClick={() => void runRestore()}
                  disabled={!preview.canProceed || loading}
                >
                  {loading ? 'Restoring…' : 'Confirm restore'}
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
            <p className="text-green-800 font-medium">{restoreResult}</p>
            <Button variant="secondary" onClick={reset}>
              <RotateCcw className="w-4 h-4 mr-1.5" />
              Restore another backup
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TenantRestoreWizard;
