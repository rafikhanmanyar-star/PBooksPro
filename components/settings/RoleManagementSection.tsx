import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { rbacApi, type RbacRoleDetail, type RbacRoleSummary } from '../../services/api/rbacApi';
import { buildPermissionGroups } from '../../shared/rbac/permissionGroups';
import { type Permission } from '../../shared/rbac/permissions';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../ui/Button';
import LoadingButton from '../ui/LoadingButton';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Select from '../ui/Select';
import { devLogger } from '../../utils/devLogger';

const permissionGroups = buildPermissionGroups();

function isImmutableAllPermissionsRole(slug: string): boolean {
  const key = slug.trim().toLowerCase().replace(/\s+/g, '_');
  return key === 'super_admin' || key === 'system_owner';
}

function canEditRolePermissions(role: RbacRoleSummary): boolean {
  return !isImmutableAllPermissionsRole(role.slug);
}

/** True when permission checkboxes / module toggles should be interactive in the editor modal. */
function canEditPermissionsInModal(canManageRoles: boolean, editing: RbacRoleDetail | null): boolean {
  if (!canManageRoles) return false;
  if (!editing) return true;
  return canEditRolePermissions(editing);
}

function logRolePermissionEditorDebug(
  event: string,
  extra: Record<string, unknown>
): void {
  devLogger.log('[RoleManagement][permissions]', event, extra);
}

function detailToSummary(detail: RbacRoleDetail): RbacRoleSummary {
  const { permissions: _permissions, ...summary } = detail;
  return summary;
}

const RoleManagementSection: React.FC = () => {
  const { showToast, showAlert, showConfirm } = useNotification();
  const { canViewRoles, canManageRoles } = usePermissions();
  const [roles, setRoles] = useState<RbacRoleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RbacRoleDetail | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [selected, setSelected] = useState<Set<Permission>>(new Set());
  const [permSearch, setPermSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!canViewRoles) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await rbacApi.listRoles();
      setRoles(data);
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load roles', { title: 'Role Management' });
    } finally {
      setLoading(false);
    }
  }, [canViewRoles, showAlert]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredGroups = useMemo(() => {
    const q = permSearch.trim().toLowerCase();
    if (!q) return permissionGroups;
    return permissionGroups
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter(
          (p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [permSearch]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setStatus('active');
    setSelected(new Set());
    setPermSearch('');
    setEditorOpen(true);
    logRolePermissionEditorDebug('openCreate', {
      canManageRoles,
      editing: null,
      permissionsEditable: canEditPermissionsInModal(canManageRoles, null),
    });
  };

  const openEdit = async (role: RbacRoleSummary) => {
    try {
      const detail = await rbacApi.getRole(role.id);
      setEditing(detail);
      setName(detail.name);
      setDescription(detail.description ?? '');
      setStatus(detail.status);
      setSelected(new Set(detail.permissions));
      setPermSearch('');
      setEditorOpen(true);
      logRolePermissionEditorDebug('openEdit', {
        canManageRoles,
        editingRoleId: detail.id,
        editingSlug: detail.slug,
        permissionsEditable: canEditPermissionsInModal(canManageRoles, detail),
        canEditRolePermissions: canEditRolePermissions(detail),
      });
    } catch (e) {
      void showAlert(e instanceof Error ? e.message : 'Failed to load role', { title: 'Role Management' });
    }
  };

  const togglePermission = (key: Permission) => {
    logRolePermissionEditorDebug('togglePermission', {
      key,
      canManageRoles,
      editing: editing?.id ?? null,
      permissionsEditable: canEditPermissionsInModal(canManageRoles, editing),
    });
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      logRolePermissionEditorDebug('selectedPermissionsUpdated', {
        key,
        checked: next.has(key),
        selectedCount: next.size,
      });
      return next;
    });
  };

  const toggleModule = (keys: Permission[], selectAll: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const key of keys) {
        if (selectAll) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) {
      await showAlert('Role name is required.', { title: 'Validation' });
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        permissions: [...selected],
      };
      let saved: RbacRoleDetail;
      if (editing) {
        saved = await rbacApi.updateRole(editing.id, { ...body, version: editing.version });
        showToast(`Role "${saved.name}" saved successfully.`, 'success');
      } else {
        saved = await rbacApi.createRole(body);
        showToast(`Role "${saved.name}" created successfully.`, 'success');
      }
      const summary = detailToSummary(saved);
      setRoles((prev) => {
        const idx = prev.findIndex((r) => r.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = summary;
          return next;
        }
        return [...prev, summary].sort((a, b) => a.name.localeCompare(b.name));
      });
      setEditorOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save role';
      await showAlert(message, { title: 'Could not save role' });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (role: RbacRoleSummary) => {
    const copyName = `${role.name} Copy`;
    try {
      await rbacApi.duplicateRole(role.id, copyName);
      showToast(`Role duplicated as "${copyName}".`, 'success');
      await load();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to duplicate role', {
        title: 'Could not duplicate role',
      });
    }
  };

  const handleDelete = async (role: RbacRoleSummary) => {
    if (role.isProtected) {
      await showAlert('System roles cannot be deleted.', { title: 'Delete role' });
      return;
    }
    if (!(await showConfirm(`Delete role "${role.name}"?`))) return;
    try {
      await rbacApi.deleteRole(role.id);
      showToast(`Role "${role.name}" deleted.`, 'success');
      await load();
    } catch (e) {
      await showAlert(e instanceof Error ? e.message : 'Failed to delete role', {
        title: 'Could not delete role',
      });
    }
  };

  if (!canViewRoles) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view roles.
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-app-muted">Loading roles…</p>;
  }

  const permissionsEditable = canEditPermissionsInModal(canManageRoles, editing);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-app-text">Role Management</h2>
          <p className="text-sm text-app-muted mt-1">
            Create and manage tenant roles. Super Admin always has all permissions (view only).
            Other system roles can have permissions customized; duplicate any role to create a fully editable copy.
          </p>
        </div>
        {canManageRoles && (
          <Button type="button" onClick={openCreate}>
            New Role
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-app-border">
        <table className="min-w-full text-sm">
          <thead className="bg-app-bg text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-app-muted">Role</th>
              <th className="px-3 py-2 font-medium text-app-muted">Description</th>
              <th className="px-3 py-2 font-medium text-app-muted text-center">Users</th>
              <th className="px-3 py-2 font-medium text-app-muted text-center">Permissions</th>
              <th className="px-3 py-2 font-medium text-app-muted">Status</th>
              <th className="px-3 py-2 font-medium text-app-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id} className="border-t border-app-border">
                <td className="px-3 py-2 font-medium text-app-text">
                  {role.name}
                  {role.isSystem && (
                    <span className="ml-2 text-xs text-app-muted">(system)</span>
                  )}
                </td>
                <td className="px-3 py-2 text-app-muted max-w-xs truncate">{role.description ?? '—'}</td>
                <td className="px-3 py-2 text-center">{role.userCount}</td>
                <td className="px-3 py-2 text-center">{role.permissionCount}</td>
                <td className="px-3 py-2 capitalize">{role.status}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => void openEdit(role)}>
                      {canManageRoles && canEditRolePermissions(role) ? 'Edit' : 'View'}
                    </Button>
                    {canManageRoles && !role.isProtected && (
                      <>
                        <Button type="button" variant="secondary" size="sm" onClick={() => void handleDuplicate(role)}>
                          Duplicate
                        </Button>
                        <Button type="button" variant="danger" size="sm" onClick={() => void handleDelete(role)}>
                          Delete
                        </Button>
                      </>
                    )}
                    {canManageRoles && role.isProtected && (
                      <Button type="button" variant="secondary" size="sm" onClick={() => void handleDuplicate(role)}>
                        Duplicate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={
          editing
            ? isImmutableAllPermissionsRole(editing.slug)
              ? `View Role: ${editing.name}`
              : editing.isProtected
                ? `Edit Permissions: ${editing.name}`
                : `Edit Role: ${editing.name}`
            : 'New Role'
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {editing && isImmutableAllPermissionsRole(editing.slug) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              This system role always includes every permission and cannot be changed. Use Duplicate to create a customizable copy.
            </div>
          )}
          {editing && editing.isProtected && canEditRolePermissions(editing) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              System role name and status are fixed. You may adjust which permissions this role grants.
            </div>
          )}
          <Input
            label="Role Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!editing?.isProtected}
          />
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!!editing?.isProtected}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            disabled={!!editing?.isProtected}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-sm font-medium text-app-text">
                Permissions ({selected.size} selected)
              </p>
              <Input
                placeholder="Search permissions…"
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {filteredGroups.map((group) => {
              const keys = group.permissions.map((p) => p.key);
              const allSelected = keys.every((k) => selected.has(k));
              return (
                <div key={group.module} className="mb-4 rounded-lg border border-app-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-app-text">{group.label}</h3>
                    {canManageRoles && permissionsEditable && (
                      <button
                        type="button"
                        className="text-xs text-ds-primary hover:underline"
                        onClick={() => toggleModule(keys, !allSelected)}
                      >
                        {allSelected ? 'Clear module' : 'Select module'}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {group.permissions.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 text-sm text-app-text">
                        <input
                          type="checkbox"
                          checked={selected.has(p.key)}
                          onChange={() => togglePermission(p.key)}
                          onClick={() =>
                            logRolePermissionEditorDebug('checkboxClick', {
                              key: p.key,
                              disabled: !permissionsEditable,
                              canManageRoles,
                              editing: editing?.id ?? null,
                            })
                          }
                          disabled={!permissionsEditable}
                        />
                        <span title={p.key}>{p.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            {canManageRoles && permissionsEditable && (
              <LoadingButton type="button" loading={saving} onClick={() => void handleSave()}>
                {editing ? 'Save Role' : 'Create Role'}
              </LoadingButton>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RoleManagementSection;
