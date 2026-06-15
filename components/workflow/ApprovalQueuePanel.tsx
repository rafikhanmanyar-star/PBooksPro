import React, { useState } from 'react';
import Button from '../ui/Button';
import { useApprovalQueue } from '../../hooks/useWorkflow';
import { usePermissions } from '../../hooks/usePermissions';
import { useNotification } from '../../context/NotificationContext';

const ENTITY_LABELS: Record<string, string> = {
  purchase_order: 'Purchase Order',
  contract: 'Contract',
  bill: 'Vendor Bill',
  payment: 'Payment',
  retention_release: 'Retention Release',
  variation_order: 'Variation Order',
};

const ApprovalQueuePanel: React.FC = () => {
  const perms = usePermissions();
  const { showToast } = useNotification();
  const [mineOnly, setMineOnly] = useState(true);
  const { data: queue = [], isLoading, act } = useApprovalQueue({ mine: mineOnly, status: 'pending' });

  if (!perms.canViewWorkflow) {
    return (
      <p className="text-sm text-app-muted">You do not have permission to view the approval queue.</p>
    );
  }

  const handleAction = async (
    requestId: string,
    action: 'approve' | 'reject' | 'return' | 'escalate'
  ) => {
    if (!perms.canApproveWorkflow) {
      showToast('You do not have permission to act on approvals.', 'error');
      return;
    }
    try {
      await act.mutateAsync({ requestId, action });
      showToast(`Request ${action}d.`, 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Approval action failed.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-app-text">Approval Queue</h3>
          <p className="text-sm text-app-muted">Pending documents awaiting approval.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-app-text cursor-pointer">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            className="rounded border-app-border"
          />
          Assigned to me
        </label>
      </div>

      {isLoading && <p className="text-sm text-app-muted">Loading queue…</p>}

      {!isLoading && queue.length === 0 && (
        <p className="text-sm text-app-muted rounded-lg border border-app-border p-4 bg-app-bg">
          No pending approval requests.
        </p>
      )}

      <div className="space-y-3">
        {queue.map((item) => (
          <div
            key={item.id}
            className="rounded-xl border border-app-border bg-app-card p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
          >
            <div>
              <div className="font-semibold text-app-text">
                {ENTITY_LABELS[item.entityType] ?? item.entityType}{' '}
                {item.entityRef ? `· ${item.entityRef}` : ''}
              </div>
              <div className="text-xs text-app-muted mt-1">
                Level {item.currentLevel}/{item.maxLevel}
                {item.amount != null ? ` · Amount ${item.amount.toLocaleString()}` : ''}
              </div>
            </div>
            {perms.canApproveWorkflow && item.status === 'pending' && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => handleAction(item.id, 'approve')}>
                  Approve
                </Button>
                <Button type="button" variant="secondary" onClick={() => handleAction(item.id, 'return')}>
                  Return
                </Button>
                <Button type="button" variant="secondary" onClick={() => handleAction(item.id, 'escalate')}>
                  Escalate
                </Button>
                <Button type="button" variant="danger" onClick={() => handleAction(item.id, 'reject')}>
                  Reject
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ApprovalQueuePanel;
