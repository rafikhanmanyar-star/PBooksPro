import React, { useCallback, useEffect, useState } from 'react';
import {
  approvalMatrixApi,
  isRbacV2ApprovalMatrixUiEnabled,
  type ApprovalMatrixSummary,
  type ApprovalEntityType,
} from '../../../services/api/securityApprovalMatrixApi';
import { useNotification } from '../../../context/NotificationContext';
import { usePermissions } from '../../../hooks/usePermissions';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import LoadingButton from '../../ui/LoadingButton';

const ENTITY_TYPES: ApprovalEntityType[] = [
  'manual_journal',
  'journal_reversal',
  'bill',
  'payment',
  'purchase_order',
  'payroll_run',
  'rental_agreement',
];

const SecurityApprovalMatrixSection: React.FC = () => {
  const { showAlert, showToast } = useNotification();
  const { has: hasPermission } = usePermissions();
  const canView = hasPermission('users.read') || hasPermission('administration.approvals.final');
  const canEdit = hasPermission('administration.approvals.final');
  const enabled = isRbacV2ApprovalMatrixUiEnabled();

  const [summary, setSummary] = useState<ApprovalMatrixSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [capUserId, setCapUserId] = useState('');
  const [capabilities, setCapabilities] = useState<
    Array<{ capabilityKey: string; entityType: string; requiredPermission: string; maxLevel: number }>
  >([]);
  const [assigneeType, setAssigneeType] = useState<'user' | 'role'>('user');
  const [assigneeId, setAssigneeId] = useState('');
  const [capabilityId, setCapabilityId] = useState('');

  const load = useCallback(async () => {
    if (!canView || !enabled) return;
    setLoading(true);
    try {
      const data = await approvalMatrixApi.getMatrix();
      setSummary(data);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load approval matrix', {
        title: 'Security — Approval Matrix',
      });
    } finally {
      setLoading(false);
    }
  }, [canView, enabled, showAlert]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadCapabilities = async () => {
    if (!capUserId.trim()) return;
    try {
      const data = await approvalMatrixApi.getUserCapabilities(capUserId.trim());
      setCapabilities(data.approvalCapabilities);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load capabilities', {
        title: 'Approval capabilities',
      });
    }
  };

  const handleAssign = async () => {
    if (!canEdit || !assigneeId.trim()) return;
    try {
      const data = await approvalMatrixApi.createAssignment({
        assigneeType,
        assigneeId: assigneeId.trim(),
        capabilityId: capabilityId || undefined,
      });
      setSummary(data);
      showToast('Approval assignment created', 'success');
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to create assignment', {
        title: 'Approval Matrix',
      });
    }
  };

  if (!enabled) {
    return (
      <p className="text-sm text-gray-500">
        RBAC v2 approval matrix UI is disabled. Set VITE_RBAC_V2_APPROVAL_MATRIX=true to enable.
      </p>
    );
  }

  if (!canView) {
    return <p className="text-sm text-gray-500">You do not have permission to view the approval matrix.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Approval Matrix</h2>
        <p className="text-sm text-gray-600 mt-1">
          Configure approval rules, levels, and assignments. Manual journal approval is mandatory and cannot be
          disabled.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}

      {summary && (
        <>
          <section>
            <h3 className="font-medium text-gray-800 mb-2">Approval Rules</h3>
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Entity</th>
                    <th className="px-3 py-2 text-left">Level</th>
                    <th className="px-3 py-2 text-left">Permission</th>
                    <th className="px-3 py-2 text-left">Min approvers</th>
                    <th className="px-3 py-2 text-left">Mandatory</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rules.filter((r) => r.is_active).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.entity_type}</td>
                      <td className="px-3 py-2">{r.approval_level}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.required_permission}</td>
                      <td className="px-3 py-2">{r.min_approvers}</td>
                      <td className="px-3 py-2">{r.is_mandatory ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="font-medium text-gray-800 mb-2">Capabilities</h3>
            <ul className="text-sm space-y-1">
              {summary.capabilities
                .filter((c) => c.is_active)
                .map((c) => (
                  <li key={c.id}>
                    <span className="font-mono">{c.capability_key}</span> → {c.entity_type} (
                    {c.required_permission})
                  </li>
                ))}
            </ul>
          </section>

          {canEdit && (
            <section className="border rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-gray-800">New Assignment</h3>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="text-sm">
                  Type
                  <select
                    className="block border rounded px-2 py-1 mt-1"
                    value={assigneeType}
                    onChange={(e) => setAssigneeType(e.target.value as 'user' | 'role')}
                  >
                    <option value="user">User</option>
                    <option value="role">Role</option>
                  </select>
                </label>
                <Input label="Assignee ID" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} />
                <label className="text-sm">
                  Capability
                  <select
                    className="block border rounded px-2 py-1 mt-1 min-w-[200px]"
                    value={capabilityId}
                    onChange={(e) => setCapabilityId(e.target.value)}
                  >
                    <option value="">Any (permission-based)</option>
                    {summary.capabilities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.capability_key}
                      </option>
                    ))}
                  </select>
                </label>
                <LoadingButton onClick={handleAssign} disabled={!assigneeId.trim()}>
                  Assign
                </LoadingButton>
              </div>
            </section>
          )}

          <section>
            <h3 className="font-medium text-gray-800 mb-2">Assignments</h3>
            <ul className="text-sm space-y-1">
              {summary.assignments
                .filter((a) => a.is_active)
                .map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span>
                      {a.assignee_type}:{a.assignee_id} @ level {a.approval_level}
                    </span>
                    {canEdit && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          try {
                            const data = await approvalMatrixApi.removeAssignment(a.id);
                            setSummary(data);
                            showToast('Assignment removed', 'success');
                          } catch (e) {
                            void showAlert(e instanceof Error ? e.message : 'Remove failed', {
                              title: 'Approval Matrix',
                            });
                          }
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
          </section>

          <section className="border rounded-lg p-4 space-y-2">
            <h3 className="font-medium text-gray-800">User Capability View</h3>
            <div className="flex gap-2 items-end">
              <Input label="User ID" value={capUserId} onChange={(e) => setCapUserId(e.target.value)} />
              <Button onClick={() => void loadCapabilities()}>Load</Button>
            </div>
            {capabilities.length > 0 && (
              <ul className="text-sm mt-2">
                {capabilities.map((c) => (
                  <li key={c.capabilityKey}>
                    {c.capabilityKey} ({c.entityType}) max level {c.maxLevel}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-gray-500">
            Entity types: {ENTITY_TYPES.join(', ')}. Changes invalidate JWT av (TOKEN_STALE on next request).
          </p>
        </>
      )}
    </div>
  );
};

export default SecurityApprovalMatrixSection;
