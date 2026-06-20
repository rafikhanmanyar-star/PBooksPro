import React, { useCallback, useEffect, useState } from 'react';
import {
  dataScopeApi,
  isRbacV2DataScopeUiEnabled,
  type ScopeDimension,
  type UserScopeSummary,
} from '../../../services/api/securityDataScopeApi';
import { useNotification } from '../../../context/NotificationContext';
import { usePermissions } from '../../../hooks/usePermissions';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import LoadingButton from '../../ui/LoadingButton';

const DIMENSIONS: { id: ScopeDimension; label: string }[] = [
  { id: 'project', label: 'Project' },
  { id: 'property', label: 'Property' },
  { id: 'owner', label: 'Owner' },
  { id: 'department', label: 'Department' },
];

const SecurityDataScopesSection: React.FC = () => {
  const { showAlert, showToast } = useNotification();
  const { has: hasPermission } = usePermissions();
  const canView = hasPermission('users.read') || hasPermission('administration.scopes.edit');
  const canEdit = hasPermission('administration.scopes.edit');
  const enabled = isRbacV2DataScopeUiEnabled();

  const [userId, setUserId] = useState('');
  const [summary, setSummary] = useState<UserScopeSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeDimension, setActiveDimension] = useState<ScopeDimension>('project');
  const [mode, setMode] = useState<'all' | 'assigned'>('assigned');
  const [entityIdsText, setEntityIdsText] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    if (!canView || !enabled || !userId.trim()) return;
    setLoading(true);
    try {
      const data = await dataScopeApi.getUserScopes(userId.trim());
      setSummary(data);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load data scopes', {
        title: 'Security — Data Scopes',
      });
    } finally {
      setLoading(false);
    }
  }, [canView, enabled, userId, showAlert]);

  useEffect(() => {
    if (userId.trim().length >= 3) void load();
  }, [userId, load]);

  const handleAssign = async () => {
    if (!canEdit || !userId.trim()) return;
    setSaving(true);
    try {
      const entityIds =
        mode === 'assigned'
          ? entityIdsText
              .split(/[\s,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      const data = await dataScopeApi.assignUserScope({
        userId: userId.trim(),
        dimension: activeDimension,
        mode,
        entityIds,
        reason: reason.trim() || undefined,
      });
      setSummary(data);
      showToast('Data scope updated', 'success');
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to assign scope', {
        title: 'Security — Data Scopes',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) {
    return (
      <p className="text-sm text-app-muted">
        RBAC v2 data scope UI is disabled. Set <code>VITE_RBAC_V2_DATA_SCOPE=true</code> to enable.
      </p>
    );
  }

  if (!canView) {
    return <p className="text-sm text-app-muted">You do not have permission to view data scopes.</p>;
  }

  const dimSummary = summary?.scopes.find((s) => s.dimension === activeDimension);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-app-text">Data Scopes</h3>
        <p className="text-sm text-app-muted mt-1">
          Assign project, property, owner, or department visibility per user. Organization = tenant (Option A).
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <div className="min-w-[240px]">
          <label className="text-xs text-app-muted block mb-1">Target user ID</label>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User UUID" />
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={!userId.trim() || loading}>
          {loading ? 'Loading…' : 'Load scopes'}
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {DIMENSIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={`px-3 py-1.5 rounded text-sm border ${
              activeDimension === d.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-app-border text-app-muted'
            }`}
            onClick={() => setActiveDimension(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>

      {summary && (
        <div className="rounded border border-app-border p-3 text-sm bg-app-surface">
          <p>
            <strong>{activeDimension}</strong>: {dimSummary?.mode ?? 'all'}
            {dimSummary?.mode === 'assigned' && dimSummary.entityIds.length > 0 && (
              <span className="text-app-muted"> — {dimSummary.entityIds.join(', ')}</span>
            )}
          </p>
          {dimSummary?.rows?.length ? (
            <ul className="mt-2 text-xs text-app-muted list-disc pl-4">
              {dimSummary.rows.map((r) => (
                <li key={r.id}>
                  row {r.id} {r.entityId ? `(entity ${r.entityId})` : '(all marker)'}
                  {canEdit && (
                    <button
                      type="button"
                      className="ml-2 text-danger underline"
                      onClick={() =>
                        void dataScopeApi.removeScope(r.id).then(setSummary).catch((e) =>
                          showAlert(e instanceof Error ? e.message : 'Remove failed', { title: 'Data Scopes' })
                        )
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {canEdit ? (
        <div className="rounded border border-app-border p-4 space-y-3 max-w-lg">
          <h4 className="font-medium text-app-text">Assign {activeDimension} scope</h4>
          <div className="flex gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} /> All
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input type="radio" checked={mode === 'assigned'} onChange={() => setMode('assigned')} /> Assigned
            </label>
          </div>
          {mode === 'assigned' && (
            <Input
              value={entityIdsText}
              onChange={(e) => setEntityIdsText(e.target.value)}
              placeholder="Entity IDs (comma or space separated)"
            />
          )}
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
          <LoadingButton loading={saving} onClick={() => void handleAssign()}>
            Save scope
          </LoadingButton>
        </div>
      ) : (
        <p className="text-sm text-app-muted">Read-only — requires administration.scopes.edit to assign scopes.</p>
      )}
    </div>
  );
};

export default SecurityDataScopesSection;
