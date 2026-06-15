import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useNotification } from '../../context/NotificationContext';
import { useWorkflowSettings } from '../../hooks/useWorkflow';
import { usePermissions } from '../../hooks/usePermissions';
import type { WorkflowConfig, WorkflowRule } from '../../services/workflowApi';

const ENTITY_OPTIONS = [
  { value: 'purchase_order', label: 'Purchase Orders' },
  { value: 'contract', label: 'Contracts' },
  { value: 'bill', label: 'Vendor Bills' },
  { value: 'payment', label: 'Payments' },
  { value: 'retention_release', label: 'Retention Releases' },
  { value: 'variation_order', label: 'Variation Orders' },
];

const WorkflowSettingsSection: React.FC = () => {
  const { data, isLoading, save } = useWorkflowSettings();
  const { showToast } = useNotification();
  const perms = usePermissions();
  const canManage = perms.canManageWorkflow;

  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<WorkflowConfig>({ levels: 3, rules: [] });

  useEffect(() => {
    if (!data) return;
    setEnabled(data.approvalWorkflowEnabled);
    setConfig(data.workflowConfig ?? { levels: 3, rules: [] });
  }, [data]);

  const addRule = () => {
    const rule: WorkflowRule = {
      id: `rule_${Date.now()}`,
      type: 'amount',
      level: 1,
      enabled: true,
      minAmount: 0,
    };
    setConfig({ ...config, rules: [...config.rules, rule] });
  };

  const updateRule = (id: string, patch: Partial<WorkflowRule>) => {
    setConfig({
      ...config,
      rules: config.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = (id: string) => {
    setConfig({ ...config, rules: config.rules.filter((r) => r.id !== id) });
  };

  const handleSave = async () => {
    if (!canManage) {
      showToast('You do not have permission to manage workflow settings.', 'error');
      return;
    }
    try {
      await save.mutateAsync({
        approvalWorkflowEnabled: enabled,
        workflowConfig: config,
      });
      showToast('Workflow settings saved.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to save workflow settings.', 'error');
    }
  };

  if (isLoading) {
    return <p className="text-sm text-app-muted">Loading workflow settings…</p>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-lg font-bold text-app-text mb-1">Workflow Settings</h3>
        <p className="text-sm text-app-muted">
          Configure tenant-wide approval workflow for purchase orders, contracts, bills, and more.
        </p>
      </div>

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-app-border"
        />
        <span className="text-sm text-app-text font-medium">Enable Approval Workflow</span>
      </label>

      {!enabled && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-app-text">
          Approval workflow is disabled. Documents will be automatically approved.
        </div>
      )}

      {enabled && (
        <div className="space-y-4 border border-app-border rounded-xl p-4 bg-app-bg">
          <div>
            <label className="text-sm font-medium text-app-text block mb-1">Approval Levels</label>
            <select
              value={config.levels}
              disabled={!canManage}
              onChange={(e) =>
                setConfig({ ...config, levels: Number(e.target.value) as 1 | 2 | 3 })
              }
              className="rounded border border-app-border bg-app-card px-3 py-2 text-sm"
            >
              <option value={1}>Level 1 only</option>
              <option value={2}>Levels 1–2</option>
              <option value={3}>Levels 1–3</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-app-text">Approval Rules</h4>
            {canManage && (
              <Button type="button" variant="secondary" onClick={addRule}>
                Add Rule
              </Button>
            )}
          </div>

          {config.rules.length === 0 && (
            <p className="text-sm text-app-muted">
              No rules configured. All requests use level 1 approval by default.
            </p>
          )}

          {config.rules.map((rule) => (
            <div key={rule.id} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 rounded-lg border border-app-border">
              <select
                value={rule.type}
                disabled={!canManage}
                onChange={(e) =>
                  updateRule(rule.id, { type: e.target.value as WorkflowRule['type'] })
                }
                className="rounded border border-app-border bg-app-card px-2 py-1.5 text-sm"
              >
                <option value="amount">Amount</option>
                <option value="department">Department</option>
                <option value="project">Project</option>
                <option value="entity">Entity</option>
                <option value="role">Role</option>
              </select>

              {rule.type === 'amount' && (
                <Input
                  id={`min-${rule.id}`}
                  name={`min-${rule.id}`}
                  label="Min amount"
                  type="number"
                  value={String(rule.minAmount ?? 0)}
                  onChange={(e) => updateRule(rule.id, { minAmount: Number(e.target.value) })}
                  disabled={!canManage}
                />
              )}

              {rule.type === 'entity' && (
                <select
                  value={rule.entityType ?? 'purchase_order'}
                  disabled={!canManage}
                  onChange={(e) => updateRule(rule.id, { entityType: e.target.value })}
                  className="rounded border border-app-border bg-app-card px-2 py-1.5 text-sm"
                >
                  {ENTITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}

              {rule.type === 'role' && (
                <Input
                  id={`role-${rule.id}`}
                  name={`role-${rule.id}`}
                  label="Role"
                  value={rule.role ?? ''}
                  onChange={(e) => updateRule(rule.id, { role: e.target.value })}
                  disabled={!canManage}
                />
              )}

              <select
                value={rule.level}
                disabled={!canManage}
                onChange={(e) =>
                  updateRule(rule.id, { level: Number(e.target.value) as 1 | 2 | 3 })
                }
                className="rounded border border-app-border bg-app-card px-2 py-1.5 text-sm"
              >
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
                <option value={3}>Level 3</option>
              </select>

              {canManage && (
                <Button type="button" variant="danger" onClick={() => removeRule(rule.id)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save Workflow Settings'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default WorkflowSettingsSection;
