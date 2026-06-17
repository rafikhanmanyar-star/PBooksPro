import React, { useEffect, useMemo, useState } from 'react';
import {
  GitBranch,
  Info,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import FormSectionCard from '../ui/FormSectionCard';
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

const RULE_TYPE_OPTIONS = [
  { value: 'amount', label: 'Amount' },
  { value: 'entity', label: 'Document type' },
  { value: 'role', label: 'Submitter role' },
];

const LEGACY_RULE_TYPE_OPTIONS = [
  { value: 'department', label: 'Department' },
  { value: 'project', label: 'Project' },
];

function ruleTypeOptionsFor(rule: WorkflowRule) {
  const base = [...RULE_TYPE_OPTIONS];
  if (rule.type === 'department' || rule.type === 'project') {
    const legacy = LEGACY_RULE_TYPE_OPTIONS.find((o) => o.value === rule.type);
    if (legacy) base.push(legacy);
  }
  return base;
}

const LEVEL_OPTIONS: { value: 1 | 2 | 3; label: string; description: string }[] = [
  { value: 1, label: '1 step', description: 'Single approver' },
  { value: 2, label: '2 steps', description: 'Two approval stages' },
  { value: 3, label: '3 steps', description: 'Up to three stages' },
];

function levelOptionsForCap(cap: 1 | 2 | 3) {
  return LEVEL_OPTIONS.filter((o) => o.value <= cap).map((o) => ({
    value: String(o.value),
    label: `Level ${o.value}`,
  }));
}

function describeRule(rule: WorkflowRule): string {
  switch (rule.type) {
    case 'amount':
      return `Amount is at least ${Number(rule.minAmount ?? 0).toLocaleString()}`;
    case 'entity':
      return (
        ENTITY_OPTIONS.find((o) => o.value === rule.entityType)?.label ??
        'Selected document type'
      );
    case 'role':
      return rule.role?.trim() ? `Role is "${rule.role.trim()}"` : 'Submitter role';
    default:
      return 'Condition';
  }
}

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

  const setMaxLevels = (levels: 1 | 2 | 3) => {
    setConfig({
      levels,
      rules: config.rules.map((rule) =>
        rule.level > levels ? { ...rule, level: levels } : rule
      ),
    });
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

  const ruleSummaries = useMemo(
    () => config.rules.map((rule) => describeRule(rule)),
    [config.rules]
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-app-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading workflow settings…
      </div>
    );
  }

  return (
    <FormSectionCard
      id="workflow-settings"
      title="Approval workflow"
      icon={<GitBranch className="h-4 w-4" aria-hidden="true" />}
      headerAction={
        canManage ? (
          <Button type="button" onClick={handleSave} disabled={save.isPending} size="sm">
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        ) : undefined
      }
    >
      <p className="text-sm text-app-muted mb-6 -mt-1">
        Require manager sign-off before purchase orders, contracts, bills, and other documents
        are approved.
      </p>

      <div className="rounded-xl border border-app-border bg-app-bg/60 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-app-text">Enable approval workflow</p>
            <p className="text-xs text-app-muted mt-1">
              {enabled
                ? 'Documents must pass approval before they are finalized.'
                : 'Documents are approved automatically without a review step.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Enable approval workflow"
            disabled={!canManage}
            onClick={() => setEnabled((v) => !v)}
            className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled ? 'bg-ds-primary' : 'bg-app-border'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {!enabled && (
        <div
          className="mt-4 flex gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-app-text"
          role="status"
        >
          <Info className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p>Workflow is off. Turn it on to require approvals for your organization.</p>
        </div>
      )}

      {enabled && (
        <div className="mt-6 space-y-8">
          <section aria-labelledby="workflow-max-levels">
            <h4 id="workflow-max-levels" className="text-sm font-semibold text-app-text">
              Maximum approval steps
            </h4>
            <p className="text-xs text-app-muted mt-1 mb-3">
              Sets the highest number of review stages any document can go through.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LEVEL_OPTIONS.map((option) => {
                const selected = config.levels === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={!canManage}
                    onClick={() => setMaxLevels(option.value)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-primary disabled:cursor-not-allowed disabled:opacity-60 ${
                      selected
                        ? 'border-ds-primary bg-ds-primary/10 ring-1 ring-ds-primary/30'
                        : 'border-app-border bg-app-card hover:border-app-muted/40'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-app-text">{option.label}</span>
                    <span className="block text-xs text-app-muted mt-0.5">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="workflow-rules">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div>
                <h4 id="workflow-rules" className="text-sm font-semibold text-app-text">
                  Routing rules
                </h4>
                <p className="text-xs text-app-muted mt-1 max-w-2xl">
                  Define when extra approval steps are required. If several rules match, the
                  highest level wins (up to your maximum steps). With no matching rules, only
                  level 1 is required.
                </p>
              </div>
              {canManage && (
                <Button type="button" variant="secondary" size="sm" onClick={addRule} className="sm:mt-0">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add rule
                </Button>
              )}
            </div>

            {config.rules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-app-border bg-app-bg/40 px-4 py-8 text-center">
                <p className="text-sm text-app-muted">No routing rules yet.</p>
                <p className="text-xs text-app-muted mt-1">
                  Every submission will use a single approval step by default.
                </p>
                {canManage && (
                  <Button type="button" variant="outline" size="sm" onClick={addRule} className="mt-4">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add your first rule
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div
                  className="hidden md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] gap-3 px-1 text-xs font-medium uppercase tracking-wide text-app-muted"
                  aria-hidden="true"
                >
                  <span>When</span>
                  <span />
                  <span>Then require</span>
                  <span />
                </div>

                {config.rules.map((rule, index) => (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-app-border bg-app-card p-4 space-y-3 md:space-y-0"
                  >
                    <div className="md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] md:items-end md:gap-3">
                      <div className="space-y-3 md:space-y-0 md:contents">
                        <Select
                          label="When"
                          hideIcon
                          value={rule.type}
                          disabled={!canManage}
                          options={ruleTypeOptionsFor(rule)}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              type: e.target.value as WorkflowRule['type'],
                            })
                          }
                          className="py-2 text-sm"
                        />

                        <span
                          className="hidden md:flex items-center justify-center pb-2 text-sm text-app-muted"
                          aria-hidden="true"
                        >
                          →
                        </span>

                        <div className="min-w-0">
                          {rule.type === 'amount' && (
                            <Input
                              id={`min-${rule.id}`}
                              name={`min-${rule.id}`}
                              label="Minimum amount"
                              type="number"
                              min={0}
                              value={String(rule.minAmount ?? 0)}
                              onChange={(e) =>
                                updateRule(rule.id, { minAmount: Number(e.target.value) || 0 })
                              }
                              disabled={!canManage}
                              compact
                              helperText="Applies when the document amount is at or above this value."
                            />
                          )}

                          {rule.type === 'entity' && (
                            <Select
                              label="Document type"
                              hideIcon
                              value={rule.entityType ?? 'purchase_order'}
                              disabled={!canManage}
                              options={ENTITY_OPTIONS}
                              onChange={(e) => updateRule(rule.id, { entityType: e.target.value })}
                              className="py-2 text-sm"
                            />
                          )}

                          {rule.type === 'role' && (
                            <Input
                              id={`role-${rule.id}`}
                              name={`role-${rule.id}`}
                              label="Role name"
                              value={rule.role ?? ''}
                              onChange={(e) => updateRule(rule.id, { role: e.target.value })}
                              disabled={!canManage}
                              compact
                              placeholder="e.g. Project Manager"
                              helperText="Matches the role of the person submitting for approval."
                            />
                          )}

                          {(rule.type === 'department' || rule.type === 'project') && (
                            <p className="text-xs text-app-muted py-2">
                              This rule type is preserved from an earlier configuration. Switch to
                              Amount, Document type, or Role to edit conditions here.
                            </p>
                          )}
                        </div>

                        <div className="flex items-end gap-2">
                          <div className="flex-1 min-w-[8rem]">
                            <Select
                              label="Approval level"
                              hideIcon
                              value={String(rule.level)}
                              disabled={!canManage}
                              options={levelOptionsForCap(config.levels)}
                              onChange={(e) =>
                                updateRule(rule.id, {
                                  level: Number(e.target.value) as 1 | 2 | 3,
                                })
                              }
                              className="py-2 text-sm"
                            />
                          </div>
                          {canManage && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeRule(rule.id)}
                              aria-label={`Remove rule ${index + 1}`}
                              className="text-app-muted hover:text-ds-danger mb-0.5"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-app-muted md:mt-2">
                      <span className="font-medium text-app-text">Preview:</span> When{' '}
                      {describeRule(rule).toLowerCase()}, require level {rule.level} approval.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {config.rules.length > 0 && (
              <div className="mt-4 flex gap-3 rounded-lg border border-app-border bg-app-bg/50 px-4 py-3 text-xs text-app-muted">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-app-text font-medium text-sm mb-1">How rules combine</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>All active rules are evaluated for each submission.</li>
                    <li>The highest matching level is used, capped at {config.levels} step{config.levels > 1 ? 's' : ''}.</li>
                    {ruleSummaries.length > 0 && (
                      <li>
                        {config.rules.length} rule{config.rules.length > 1 ? 's' : ''} configured
                        {ruleSummaries.length <= 3
                          ? `: ${ruleSummaries.join('; ')}`
                          : '.'}
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {canManage && enabled && (
        <div className="mt-6 flex justify-end md:hidden">
          <Button type="button" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      )}
    </FormSectionCard>
  );
};

export default WorkflowSettingsSection;
