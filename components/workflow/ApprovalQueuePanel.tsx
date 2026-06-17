import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  RotateCcw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import Button from '../ui/Button';
import FormSectionCard from '../ui/FormSectionCard';
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
  const { data: queue = [], isLoading, act } = useApprovalQueue({
    mine: mineOnly,
    status: 'pending',
  });

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
    <FormSectionCard
      id="approval-queue"
      title="Pending approvals"
      icon={<Inbox className="h-4 w-4" aria-hidden="true" />}
      headerAction={
        !isLoading && queue.length > 0 ? (
          <span className="inline-flex items-center rounded-full bg-ds-primary/15 px-2.5 py-0.5 text-xs font-semibold text-ds-primary">
            {queue.length} pending
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 -mt-1 mb-5">
        <p className="text-sm text-app-muted">
          Review documents waiting for your decision.
        </p>
        <div className="inline-flex rounded-lg border border-app-border bg-app-bg p-0.5">
          <button
            type="button"
            onClick={() => setMineOnly(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              mineOnly
                ? 'bg-app-card text-app-text shadow-sm'
                : 'text-app-muted hover:text-app-text'
            }`}
          >
            Assigned to me
          </button>
          <button
            type="button"
            onClick={() => setMineOnly(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              !mineOnly
                ? 'bg-app-card text-app-text shadow-sm'
                : 'text-app-muted hover:text-app-text'
            }`}
          >
            All pending
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 justify-center text-sm text-app-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading queue…
        </div>
      )}

      {!isLoading && queue.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-app-border bg-app-bg/40 px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-app-table-selected text-ds-primary mb-3">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-app-text">You're all caught up</p>
          <p className="text-xs text-app-muted mt-1 max-w-sm">
            {mineOnly
              ? 'No documents are currently assigned to you for approval.'
              : 'There are no pending approval requests in the queue.'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {queue.map((item) => (
          <article
            key={item.id}
            className="rounded-xl border border-app-border bg-app-bg/50 p-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-app-text truncate">
                    {ENTITY_LABELS[item.entityType] ?? item.entityType}
                  </h4>
                  {item.entityRef && (
                    <span className="text-sm text-app-muted truncate">{item.entityRef}</span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Pending
                  </span>
                </div>
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-app-muted">
                  <div className="flex items-center gap-1">
                    <dt className="sr-only">Approval step</dt>
                    <dd>
                      Step {item.currentLevel} of {item.maxLevel}
                    </dd>
                  </div>
                  {item.amount != null && (
                    <div className="flex items-center gap-1">
                      <dt className="sr-only">Amount</dt>
                      <dd>Amount {item.amount.toLocaleString()}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {perms.canApproveWorkflow && item.status === 'pending' && (
                <div className="flex flex-wrap gap-2 lg:flex-shrink-0">
                  <Button type="button" size="sm" onClick={() => handleAction(item.id, 'approve')}>
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAction(item.id, 'return')}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Return
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => handleAction(item.id, 'escalate')}
                  >
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    Escalate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAction(item.id, 'reject')}
                    className="text-ds-danger border-ds-danger/30 hover:bg-ds-danger/10"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </FormSectionCard>
  );
};

export default ApprovalQueuePanel;
