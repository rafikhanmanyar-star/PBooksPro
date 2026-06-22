import React from 'react';
import type { PayrollRun } from '../types';
import PayrollRunApprovalPanel from '../components/PayrollRunApprovalPanel';

type UserLike = { id: string; name?: string; username?: string };

type Props = {
  run: PayrollRun | null;
  payslipCount: number;
  canApprove: boolean;
  currentUserId: string | null | undefined;
  currentUser?: UserLike | null;
  users: readonly UserLike[];
  onApprove: () => void;
  onUnapprove: () => void;
  busy?: boolean;
  error?: string;
};

const ApprovalStep: React.FC<Props> = ({
  run,
  payslipCount,
  canApprove,
  currentUserId,
  currentUser,
  users,
  onApprove,
  onUnapprove,
  busy,
  error,
}) => {
  if (!run) {
    return <p className="text-sm text-app-muted">Generate summaries and process payslips first.</p>;
  }

  return (
    <PayrollRunApprovalPanel
      run={run}
      payslipCount={payslipCount}
      canApprove={canApprove}
      currentUserId={currentUserId}
      currentUser={currentUser}
      users={users}
      onApprove={onApprove}
      onUnapprove={onUnapprove}
      busy={busy}
      error={error}
    />
  );
};

export default ApprovalStep;
