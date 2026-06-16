import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { rbacApi, type PermissionCatalogResponse } from '../../services/api/rbacApi';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';
import Input from '../ui/Input';

const PermissionCatalogSection: React.FC = () => {
  const { showNotification } = useNotification();
  const { canViewPermissionCatalog, permissionsLoading } = usePermissions();
  const [catalog, setCatalog] = useState<PermissionCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');

  const load = useCallback(async () => {
    if (permissionsLoading) return;
    if (!canViewPermissionCatalog) {
      setLoading(false);
      setCatalog(null);
      return;
    }
    setLoading(true);
    try {
      const data = await rbacApi.getPermissionCatalog();
      setCatalog(data);
    } catch (e) {
      setCatalog(null);
      showNotification(e instanceof Error ? e.message : 'Failed to load permission catalog', 'error');
    } finally {
      setLoading(false);
    }
  }, [canViewPermissionCatalog, permissionsLoading, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  const modules = useMemo(() => {
    if (!catalog) return [];
    return catalog.groups.map((g) => ({ id: g.module, label: g.label }));
  }, [catalog]);

  const filteredGroups = useMemo(() => {
    if (!catalog) return [];
    const q = search.trim().toLowerCase();
    return catalog.groups
      .filter((g) => moduleFilter === 'all' || g.module === moduleFilter)
      .map((g) => ({
        ...g,
        permissions: g.permissions.filter((p) => {
          if (!q) return true;
          const meta = catalog.permissions.find((x) => x.key === p.key);
          const roleNames = (meta?.roles ?? []).map((r) => r.name).join(' ');
          return (
            p.label.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            roleNames.toLowerCase().includes(q)
          );
        }),
      }))
      .filter((g) => g.permissions.length > 0);
  }, [catalog, moduleFilter, search]);

  if (!canViewPermissionCatalog) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        You do not have permission to view the permission catalog.
      </div>
    );
  }

  if (permissionsLoading || loading) {
    return <p className="text-sm text-app-muted">Loading permission catalog…</p>;
  }

  if (!catalog) {
    return <p className="text-sm text-app-muted">Permission catalog unavailable.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-app-text">Permission Catalog</h2>
        <p className="text-sm text-app-muted mt-1">
          All system permissions grouped by module. Search or filter to inspect which roles grant each permission.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Search permissions or roles…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <select
          className="rounded-md border border-app-border bg-app-card px-3 py-2 text-sm"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {filteredGroups.map((group) => (
          <div key={group.module} className="rounded-lg border border-app-border overflow-hidden">
            <div className="bg-app-bg px-4 py-2 font-medium text-app-text">{group.label}</div>
            <div className="divide-y divide-app-border">
              {group.permissions.map((perm) => {
                const meta = catalog.permissions.find((p) => p.key === perm.key);
                return (
                  <div key={perm.key} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="font-medium text-app-text">{perm.label}</p>
                      <p className="text-xs text-app-muted font-mono">{perm.key}</p>
                    </div>
                    <div className="lg:col-span-2">
                      <p className="text-xs text-app-muted mb-1">Roles with this permission</p>
                      {meta && meta.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {meta.roles.map((r) => (
                            <span
                              key={r.id}
                              className="inline-flex rounded-full bg-app-bg border border-app-border px-2 py-0.5 text-xs text-app-text"
                            >
                              {r.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-app-muted">—</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PermissionCatalogSection;
