import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../services/api/client';
import {
  createReportShare,
  deleteReportShare,
  fetchReportShares,
  type ReportShare,
} from '../../../services/api/reportDesignerApi';

type Props = {
  definitionId: string | null;
  canManage: boolean;
};

const ROLES = ['Admin', 'Manager', 'Accountant', 'User'] as const;
const PERMISSIONS: ReportShare['permission'][] = ['view', 'edit', 'clone'];

const ReportSharePanel: React.FC<Props> = ({ definitionId, canManage }) => {
  const queryClient = useQueryClient();
  const [shareMode, setShareMode] = useState<'user' | 'role'>('user');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<string>(ROLES[0]);
  const [permission, setPermission] = useState<ReportShare['permission']>('view');
  const [error, setError] = useState<string | null>(null);

  const sharesQuery = useQuery({
    queryKey: ['reportShares', definitionId],
    queryFn: () => fetchReportShares(definitionId!),
    enabled: Boolean(definitionId) && canManage,
  });

  const usersQuery = useQuery({
    queryKey: ['orgUsersForShare'],
    queryFn: () =>
      apiClient.get<{ id: string; name: string; username: string; role: string }[]>('/users'),
    enabled: Boolean(definitionId) && canManage && shareMode === 'user',
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createReportShare(definitionId!, {
        sharedWithUserId: shareMode === 'user' ? userId : undefined,
        sharedWithRole: shareMode === 'role' ? role : undefined,
        permission,
      }),
    onSuccess: () => {
      setError(null);
      setUserId('');
      void queryClient.invalidateQueries({ queryKey: ['reportShares', definitionId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (shareId: string) => deleteReportShare(shareId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['reportShares', definitionId] });
    },
  });

  if (!definitionId) {
    return (
      <section className="border border-app-border rounded-xl bg-app-card p-3 text-xs text-app-muted">
        Save this report first to share with users or roles.
      </section>
    );
  }

  if (!canManage) {
    return null;
  }

  const shares = sharesQuery.data ?? [];

  return (
    <section className="border border-app-border rounded-xl bg-app-card flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-app-border text-xs font-bold uppercase tracking-wide text-app-muted">
        Share report
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="flex gap-2">
          <button
            type="button"
            className={`px-2 py-1 rounded border ${shareMode === 'user' ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border'}`}
            onClick={() => setShareMode('user')}
          >
            User
          </button>
          <button
            type="button"
            className={`px-2 py-1 rounded border ${shareMode === 'role' ? 'border-indigo-500 bg-indigo-500/10' : 'border-app-border'}`}
            onClick={() => setShareMode('role')}
          >
            Role
          </button>
        </div>
        {shareMode === 'user' ? (
          <select
            className="w-full rounded-lg border border-app-border bg-app-input px-2 py-1"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            <option value="">Select user…</option>
            {(usersQuery.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.username})
              </option>
            ))}
          </select>
        ) : (
          <select
            className="w-full rounded-lg border border-app-border bg-app-input px-2 py-1"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <select
          className="w-full rounded-lg border border-app-border bg-app-input px-2 py-1"
          value={permission}
          onChange={(e) => setPermission(e.target.value as ReportShare['permission'])}
        >
          {PERMISSIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {error && <p className="text-ds-danger">{error}</p>}
        <button
          type="button"
          className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium disabled:opacity-50"
          disabled={createMutation.isPending || (shareMode === 'user' && !userId)}
          onClick={() => createMutation.mutate()}
        >
          Add share
        </button>
        {shares.length > 0 && (
          <ul className="space-y-1 pt-2 border-t border-app-border">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-app-border px-2 py-1"
              >
                <span className="truncate">
                  {s.userName
                    ? `${s.userName} (${s.userUsername})`
                    : `Role: ${s.sharedWithRole}`}{' '}
                  · {s.permission}
                </span>
                <button
                  type="button"
                  className="text-red-600 shrink-0"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ReportSharePanel;
