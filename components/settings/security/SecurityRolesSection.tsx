import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  securityRbacApi,
  type RoleTemplateSummary,
  type SecurityRoleDetail,
  type SecurityRoleSummary,
  type RbacAuditEntry,
  isRbacV2RoleManagementUiEnabled,
} from '../../../services/api/securityRbacApi';
import { useNotification } from '../../../context/NotificationContext';
import { usePermissions } from '../../../hooks/usePermissions';
import Button from '../../ui/Button';
import LoadingButton from '../../ui/LoadingButton';
import Modal from '../../ui/Modal';
import Input from '../../ui/Input';
import { breakGlassApi, isBreakGlassUiEnabled } from '../../../services/api/breakGlassApi';
import { useBreakGlassSession } from '../../../hooks/useBreakGlassSession';
import { apiClient } from '../../../services/api/client';

type Tab = 'roles' | 'templates' | 'audit';

const SecurityRolesSection: React.FC = () => {
  const { showToast, showAlert } = useNotification();
  const { canViewRoles, canManageRoles } = usePermissions();
  const v2Enabled = isRbacV2RoleManagementUiEnabled();

  const [tab, setTab] = useState<Tab>('roles');
  const [roles, setRoles] = useState<SecurityRoleSummary[]>([]);
  const [templates, setTemplates] = useState<RoleTemplateSummary[]>([]);
  const [audit, setAudit] = useState<RbacAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SecurityRoleDetail | null>(null);
  const [instantiateOpen, setInstantiateOpen] = useState(false);
  const [instantiateTemplate, setInstantiateTemplate] = useState<RoleTemplateSummary | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [saving, setSaving] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [activatingBreakGlass, setActivatingBreakGlass] = useState(false);
  const breakGlassEnabled = isBreakGlassUiEnabled();
  const { status: breakGlassStatus, refresh: refreshBreakGlass } = useBreakGlassSession(breakGlassEnabled);

  const load = useCallback(async () => {
    if (!canViewRoles || !v2Enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [roleList, templateList, auditList] = await Promise.all([
        securityRbacApi.listRoles(),
        securityRbacApi.listTemplates(),
        securityRbacApi.listAudit(),
      ]);
      setRoles(roleList);
      setTemplates(templateList);
      setAudit(auditList);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load security roles', {
        title: 'Security — Roles',
      });
    } finally {
      setLoading(false);
    }
  }, [canViewRoles, v2Enabled, showAlert]);

  useEffect(() => {
    void load();
  }, [load]);

  const openRole = async (id: string) => {
    try {
      const detail = await securityRbacApi.getRole(id);
      setSelected(detail);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load role', { title: 'Role Details' });
    }
  };

  const handleInstantiate = async () => {
    if (!instantiateTemplate || !newRoleName.trim()) return;
    setSaving(true);
    try {
      await securityRbacApi.instantiateTemplate(instantiateTemplate.id, { name: newRoleName.trim() });
      showToast('Role created from template');
      setInstantiateOpen(false);
      setNewRoleName('');
      await load();
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Instantiation failed', { title: 'Template' });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (role: SecurityRoleSummary) => {
    if (role.isProtected || role.systemRole) return;
    try {
      await securityRbacApi.archiveRole(role.id, role.version);
      showToast('Role archived');
      await load();
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Archive failed', { title: 'Archive Role' });
    }
  };

  const handleRestore = async (role: SecurityRoleSummary) => {
    try {
      await securityRbacApi.restoreRole(role.id, role.version);
      showToast('Role restored');
      await load();
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Restore failed', { title: 'Restore Role' });
    }
  };

  const tabs = useMemo(
    () => [
      { id: 'roles' as const, label: 'Roles' },
      { id: 'templates' as const, label: 'Templates' },
      { id: 'audit' as const, label: 'Audit' },
    ],
    []
  );

  if (!v2Enabled) {
    return (
      <div className="rounded-lg border border-app-border p-4 text-sm text-app-muted">
        RBAC 2.0 role management is disabled. Set{' '}
        <code className="text-xs">VITE_RBAC_V2_ROLE_MANAGEMENT=true</code> and{' '}
        <code className="text-xs">RBAC_V2_ROLE_MANAGEMENT=true</code> on the API to enable Security → Roles.
      </div>
    );
  }

  if (!canViewRoles) {
    return <p className="text-sm text-app-muted">You do not have permission to view roles.</p>;
  }

  if (loading) {
    return <p className="text-sm text-app-muted">Loading security roles…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-app-text">Security — Roles</h2>
        <p className="text-sm text-app-muted mt-1">
          RBAC 2.0 role management with delegation, privilege ceiling, and separation-of-duties validation.
        </p>
      </div>

      {breakGlassEnabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">Break-glass (SYSTEM_OWNER)</h3>
          <p className="mt-1 text-amber-900">
            Vendor-granted emergency session (15 min default). Requires MFA. All actions audited as{' '}
            <code className="text-xs">system_owner</code>.
          </p>
          {breakGlassStatus.active ? (
            <p className="mt-2 font-medium">
              Session active until {breakGlassStatus.expiresAt ? new Date(breakGlassStatus.expiresAt).toLocaleString() : '—'}.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Input
                label="Authenticator code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="6-digit TOTP"
                className="max-w-[12rem]"
              />
              <LoadingButton
                loading={activatingBreakGlass}
                disabled={totpCode.trim().length < 6}
                onClick={async () => {
                  setActivatingBreakGlass(true);
                  try {
                    const result = await breakGlassApi.activate({ totpCode: totpCode.trim() });
                    const tenantId = apiClient.getTenantId();
                    if (tenantId) apiClient.setAuth(result.token, tenantId);
                    setTotpCode('');
                    await refreshBreakGlass();
                    showToast('Break-glass session activated');
                  } catch (e) {
                    void showAlert(e instanceof Error ? e.message : 'Activation failed', {
                      title: 'Break-glass',
                    });
                  } finally {
                    setActivatingBreakGlass(false);
                  }
                }}
              >
                Activate break-glass
              </LoadingButton>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 border-b border-app-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-1 text-sm rounded ${tab === t.id ? 'bg-app-accent text-white' : 'text-app-muted hover:text-app-text'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'roles' && (
        <div className="overflow-x-auto rounded-lg border border-app-border">
          <table className="min-w-full text-sm">
            <thead className="bg-app-bg text-left">
              <tr>
                <th className="px-3 py-2 font-medium text-app-muted">Role</th>
                <th className="px-3 py-2 font-medium text-app-muted">Type</th>
                <th className="px-3 py-2 font-medium text-app-muted">Status</th>
                <th className="px-3 py-2 font-medium text-app-muted text-center">Users</th>
                <th className="px-3 py-2 font-medium text-app-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className="border-t border-app-border">
                  <td className="px-3 py-2">
                    <button type="button" className="text-left hover:underline" onClick={() => void openRole(role.id)}>
                      {role.name}
                    </button>
                    <div className="text-xs text-app-muted">{role.slug}</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{role.roleType}</td>
                  <td className="px-3 py-2 capitalize">{role.status}</td>
                  <td className="px-3 py-2 text-center">{role.userCount}</td>
                  <td className="px-3 py-2 space-x-2">
                    {canManageRoles && role.status !== 'archived' && !role.isProtected && (
                      <Button type="button" variant="secondary" onClick={() => void handleArchive(role)}>
                        Archive
                      </Button>
                    )}
                    {canManageRoles && role.status === 'archived' && (
                      <Button type="button" variant="secondary" onClick={() => void handleRestore(role)}>
                        Restore
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'templates' && (
        <div className="grid gap-3 md:grid-cols-2">
          {templates.map((tpl) => (
            <div key={tpl.id} className="rounded-lg border border-app-border p-4">
              <h3 className="font-medium text-app-text">{tpl.name}</h3>
              <p className="text-sm text-app-muted mt-1">{tpl.description}</p>
              <p className="text-xs text-app-muted mt-2">{tpl.permissionCount} permissions · {tpl.category}</p>
              {canManageRoles && (
                <Button
                  type="button"
                  className="mt-3"
                  onClick={() => {
                    setInstantiateTemplate(tpl);
                    setNewRoleName(`${tpl.name} Copy`);
                    setInstantiateOpen(true);
                  }}
                >
                  Instantiate
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="overflow-x-auto rounded-lg border border-app-border max-h-96">
          <table className="min-w-full text-sm">
            <thead className="bg-app-bg text-left sticky top-0">
              <tr>
                <th className="px-3 py-2 font-medium text-app-muted">Time</th>
                <th className="px-3 py-2 font-medium text-app-muted">Action</th>
                <th className="px-3 py-2 font-medium text-app-muted">Target</th>
                <th className="px-3 py-2 font-medium text-app-muted">Reason</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id} className="border-t border-app-border">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2">{row.target_type}</td>
                  <td className="px-3 py-2 text-app-muted">{row.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? 'Role Details'}>
        {selected && (
          <div className="space-y-2 text-sm">
            <p><span className="text-app-muted">Slug:</span> {selected.slug}</p>
            <p><span className="text-app-muted">Version:</span> {selected.version}</p>
            <p><span className="text-app-muted">Hash:</span> <code className="text-xs">{selected.roleVersionHash ?? '—'}</code></p>
            <p className="text-app-muted">Permissions ({selected.permissions.length})</p>
            <ul className="max-h-48 overflow-y-auto text-xs font-mono border border-app-border rounded p-2">
              {selected.permissions.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={instantiateOpen}
        onClose={() => setInstantiateOpen(false)}
        title={instantiateTemplate ? `Instantiate: ${instantiateTemplate.name}` : 'Instantiate Template'}
      >
        <div className="space-y-3">
          <Input label="New role name" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setInstantiateOpen(false)}>
              Cancel
            </Button>
            <LoadingButton type="button" loading={saving} onClick={() => void handleInstantiate()}>
              Create Role
            </LoadingButton>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SecurityRolesSection;
