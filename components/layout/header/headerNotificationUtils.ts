import type { InstallmentPlan, User } from '../../../types';
import type { NotificationBadgeTone, NotificationItem, TaskBellRow } from './headerNotificationTypes';

export function formatNotificationTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const now = new Date();
  const isToday = parsed.toDateString() === now.toDateString();
  if (isToday) {
    return parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isMatchingCurrentUser(
  value: string | undefined,
  currentUser: { id: string; username?: string; name?: string }
): boolean {
  if (!value || !currentUser) return false;
  const candidates = [currentUser.id, currentUser.username, currentUser.name]
    .filter(Boolean)
    .map((item) => item!.toString().toLowerCase());
  return candidates.includes(value.toString().toLowerCase());
}

/** Plan notification count for badge — no contact/project/unit labels required. */
export function countPlanNotifications(
  installmentPlans: InstallmentPlan[],
  currentUser: { id: string; username?: string; name?: string },
  dismissed: Set<string>
): number {
  const currentUserId = currentUser.id;
  let count = 0;

  for (const plan of installmentPlans || []) {
    const normalizedStatus = (plan.status || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
    const isPendingApproval = normalizedStatus === 'pending approval';
    const isApprovedStatus = normalizedStatus === 'approved';
    const isRejectedStatus = normalizedStatus === 'rejected';

    const isApprover =
      isPendingApproval &&
      (plan.approvalRequestedToId === currentUserId ||
        isMatchingCurrentUser(plan.approvalRequestedToId, currentUser));
    if (isApprover && !dismissed.has(`approval:${plan.id}`)) {
      count += 1;
    }

    const isDecisionRecipient =
      (isApprovedStatus || isRejectedStatus) &&
      (plan.approvalRequestedById === currentUserId ||
        plan.userId === currentUserId ||
        isMatchingCurrentUser(plan.approvalRequestedById, currentUser) ||
        isMatchingCurrentUser(plan.userId, currentUser));
    if (isDecisionRecipient && !dismissed.has(`decision:${plan.id}:${plan.status}`)) {
      count += 1;
    }
  }

  return count;
}

export function buildPlanNotificationItems(
  installmentPlans: InstallmentPlan[],
  currentUser: { id: string; username?: string; name?: string },
  usersForNotifications: Pick<User, 'id' | 'name' | 'username'>[],
  planLabel: (planId: string) => string
): NotificationItem[] {
  const currentUserId = currentUser.id;

  const userName = (userId?: string) => {
    if (!userId) return undefined;
    const user = usersForNotifications.find((u) => u.id === userId);
    return user?.name || user?.username;
  };

  const getStatusTone = (status: string): NotificationBadgeTone => {
    if (status === 'Pending Approval') return 'blue';
    if (status === 'Approved') return 'green';
    if (status === 'Rejected') return 'red';
    return 'slate';
  };

  return (installmentPlans || []).flatMap((plan) => {
    const time = plan.updatedAt || plan.createdAt || '';
    const normalizedStatus = (plan.status || '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
    const isPendingApproval = normalizedStatus === 'pending approval';
    const isApprovedStatus = normalizedStatus === 'approved';
    const isRejectedStatus = normalizedStatus === 'rejected';
    const base = { time };
    const results: NotificationItem[] = [];

    const isApprover =
      isPendingApproval &&
      (plan.approvalRequestedToId === currentUserId ||
        isMatchingCurrentUser(plan.approvalRequestedToId, currentUser));
    if (isApprover) {
      const requester = userName(plan.approvalRequestedById || plan.userId);
      results.push({
        ...base,
        id: `approval:${plan.id}`,
        title: 'Plan approval requested',
        message: requester ? `${planLabel(plan.id)} • Requested by ${requester}` : planLabel(plan.id),
        badge: { label: 'Pending Approval', tone: getStatusTone('Pending Approval') },
        action: { type: 'installment_plan', planId: plan.id },
      });
    }

    if (
      (isApprovedStatus || isRejectedStatus) &&
      (plan.approvalRequestedById === currentUserId ||
        plan.userId === currentUserId ||
        isMatchingCurrentUser(plan.approvalRequestedById, currentUser) ||
        isMatchingCurrentUser(plan.userId, currentUser))
    ) {
      const reviewer = userName(plan.approvalReviewedById);
      results.push({
        ...base,
        id: `decision:${plan.id}:${plan.status}`,
        title: `Plan ${plan.status.toLowerCase()}`,
        message: reviewer ? `${planLabel(plan.id)} • Reviewed by ${reviewer}` : planLabel(plan.id),
        badge: { label: plan.status, tone: getStatusTone(plan.status) },
        action: { type: 'installment_plan', planId: plan.id },
      });
    }

    return results;
  });
}

export function buildTaskNotificationItems(taskBellRows: TaskBellRow[]): NotificationItem[] {
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  return taskBellRows.map((task) => {
    const td = task.targetDate.slice(0, 10);
    let badgeLabel = 'Upcoming';
    let tone: NotificationBadgeTone = 'orange';
    if (td < todayLocal) {
      badgeLabel = 'Overdue';
      tone = 'red';
    } else if (td === todayLocal) {
      badgeLabel = 'Due today';
      tone = 'orange';
    } else {
      badgeLabel = `Due ${td}`;
      tone = 'blue';
    }
    return {
      id: `task:${task.id}`,
      title: 'Task deadline',
      message: task.title,
      time: task.updatedAt || task.createdAt || new Date().toISOString(),
      badge: { label: badgeLabel, tone },
      action: { type: 'personal_task' as const, taskId: task.id },
    };
  });
}
