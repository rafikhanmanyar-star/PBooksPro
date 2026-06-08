import React, { useCallback, useEffect, useState } from 'react';
import { permissionsApi, type PermissionMatrixResponse } from '../../services/api/permissionsApi';
import { PERMISSION_LABELS, type Permission } from '../../shared/rbac/permissions';
import { useNotification } from '../../context/NotificationContext';
import { usePermissions } from '../../hooks/usePermissions';

const PermissionManagementSection: React.FC = () => {
  const { showNotification } = useNotification();
  const { canReadPermissions, enterpriseRoleLabel } = usePermissions();
  const [matrix, setMatrix] = useState<PermissionMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!canReadPermissions) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await permissionsApi.getMatrix();
      setMatrix(data);
    } catch (e) {
      showNotification(e instanceof Error ? e.message : 'Failed to load permission matrix.', 'error');
    } finally {
      setLoading(false);
    }
  }, [canReadPermissions, showNotification]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canReadPermissions) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Your role ({enterpriseRoleLabel}) cannot view the permission matrix.
      </div>
    );
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Loading permission matrix…</p>;
  }

  if (!matrix) {
    return <p className="text-sm text-slate-500">Permission matrix unavailable.</p>;
  }

  const permKeys = matrix.permissions.map((p) => p.key);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-800">Permission Management</h2>
        <p className="text-sm text-slate-500 mt-1">
          Enterprise RBAC matrix. Assign roles in User Management; permissions are enforced on the server for every API call.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium text-slate-600 sticky left-0 bg-slate-50">Permission</th>
              {matrix.roles.map((r) => (
                <th key={r.role} className="px-2 py-2 font-medium text-slate-600 text-center whitespace-nowrap">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permKeys.map((perm) => (
              <tr key={perm} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-700 sticky left-0 bg-white whitespace-nowrap">
                  {PERMISSION_LABELS[perm as Permission] ?? perm}
                </td>
                {matrix.roles.map((r) => {
                  const allowed = r.permissions.includes(perm as Permission);
                  return (
                    <td key={`${r.role}-${perm}`} className="px-2 py-2 text-center">
                      {allowed ? (
                        <span className="text-emerald-600 font-bold" aria-label="allowed">
                          ✓
                        </span>
                      ) : (
                        <span className="text-slate-300" aria-label="denied">
                          —
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PermissionManagementSection;
