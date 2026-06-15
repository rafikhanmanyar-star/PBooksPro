import React from 'react';
import Button from '../ui/Button';
import { useWorkflowSettings } from '../../hooks/useWorkflow';
import { useNotification } from '../../context/NotificationContext';
import { submitEntityForApproval } from '../../services/workflowApi';

type SubmitForApprovalButtonProps = {
  entityType: 'bill' | 'contract' | 'payment' | 'purchase_order';
  entityId: string;
  approvalStatus?: string | null;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onSubmitted?: () => void;
};

const SubmitForApprovalButton: React.FC<SubmitForApprovalButtonProps> = ({
  entityType,
  entityId,
  approvalStatus,
  disabled,
  size = 'sm',
  className,
  onSubmitted,
}) => {
  const { data: settings } = useWorkflowSettings();
  const { showToast } = useNotification();
  const [busy, setBusy] = React.useState(false);

  const workflowOn = settings?.approvalWorkflowEnabled === true;
  const status = String(approvalStatus ?? 'Approved');
  const canSubmit = workflowOn && status === 'Draft' && Boolean(entityId);

  if (!canSubmit) return null;

  const handleSubmit = async () => {
    setBusy(true);
    try {
      const result = await submitEntityForApproval({ entityType, entityId });
      if (result.mode === 'auto_approved') {
        showToast('Approved automatically (workflow disabled).', 'success');
      } else {
        showToast('Submitted for approval.', 'success');
      }
      onSubmitted?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Submit for approval failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      className={className}
      disabled={disabled || busy}
      onClick={() => void handleSubmit()}
    >
      {busy ? 'Submitting…' : 'Submit for Approval'}
    </Button>
  );
};

export default SubmitForApprovalButton;
