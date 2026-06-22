import React, { useState, useEffect } from 'react';
import { Save, Loader2, CheckCircle2 } from 'lucide-react';
import { payrollApi } from '../../../services/api/payrollApi';
import { usePayrollPaymentState } from '../../../hooks/useSelectiveState';
import { isAccountingBackedByRemoteApi } from '../../../config/apiUrl';

const GLDefaultsSettings: React.FC = () => {
  const { accounts, categories, projects } = usePayrollPaymentState();
  const isApi = isAccountingBackedByRemoteApi();

  const [defaultAccountId, setDefaultAccountId] = useState('');
  const [defaultCategoryId, setDefaultCategoryId] = useState('');
  const [defaultProjectId, setDefaultProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApi) { setLoading(false); return; }
    payrollApi.getPayrollSettings()
      .then(s => {
        setDefaultAccountId(s.defaultAccountId ?? '');
        setDefaultCategoryId(s.defaultCategoryId ?? '');
        setDefaultProjectId(s.defaultProjectId ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isApi]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await payrollApi.updatePayrollSettings({
        defaultAccountId: defaultAccountId || null,
        defaultCategoryId: defaultCategoryId || null,
        defaultProjectId: defaultProjectId || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Failed to save GL defaults.');
    } finally {
      setSaving(false);
    }
  };

  if (!isApi) {
    return (
      <p className="text-sm text-app-muted px-1">
        GL default settings require server mode. Running in local-only mode — defaults are applied per payment.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-app-muted text-sm py-2">
        <Loader2 size={15} className="animate-spin" /> Loading GL settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-app-muted">
        These defaults pre-fill the account, category, and project selectors when paying payslips. They can be overridden per payment.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-1.5">
            Default Expense Account
          </label>
          <select
            value={defaultAccountId}
            onChange={e => setDefaultAccountId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-app-border bg-app-card text-sm font-medium text-app-text focus:ring-2 ring-primary/20 outline-none"
            aria-label="Default Expense Account"
          >
            <option value="">— None —</option>
            {(accounts ?? []).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-app-muted mt-1">Used for payroll expense transactions.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-1.5">
            Default Category
          </label>
          <select
            value={defaultCategoryId}
            onChange={e => setDefaultCategoryId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-app-border bg-app-card text-sm font-medium text-app-text focus:ring-2 ring-primary/20 outline-none"
            aria-label="Default Category"
          >
            <option value="">— None —</option>
            {(categories ?? []).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-app-muted mt-1">Default category for payroll entries.</p>
        </div>

        <div>
          <label className="block text-xs font-bold text-app-muted uppercase tracking-wider mb-1.5">
            Default Project
          </label>
          <select
            value={defaultProjectId}
            onChange={e => setDefaultProjectId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-app-border bg-app-card text-sm font-medium text-app-text focus:ring-2 ring-primary/20 outline-none"
            aria-label="Default Project"
          >
            <option value="">— None —</option>
            {(projects ?? []).map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <p className="text-[10px] text-app-muted mt-1">Optional default project allocation.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-ds-on-primary rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving
            ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
            : saved
            ? <><CheckCircle2 size={15} /> Saved</>
            : <><Save size={15} /> Save GL Defaults</>}
        </button>
        {saved && <span className="text-sm text-ds-success font-medium">GL defaults updated.</span>}
      </div>
    </div>
  );
};

export default GLDefaultsSettings;
