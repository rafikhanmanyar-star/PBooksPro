import { useDispatchOnly, useFullAppState } from '../../hooks/useSelectiveState';
import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { WhatsAppTemplates } from '../../types';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';

const WHATSAPP_TEMPLATE_KEYS: (keyof WhatsAppTemplates)[] = [
  'invoiceReminder',
  'invoiceReceipt',
  'billPayment',
  'billToOwner',
  'billToTenant',
  'vendorGreeting',
  'ownerPayoutLedger',
  'brokerPayoutLedger',
  'payoutConfirmation',
];

function snapshotTemplates(t: WhatsAppTemplates): string {
  const o: Record<string, string> = {};
  for (const k of WHATSAPP_TEMPLATE_KEYS) {
    o[k as string] = t[k] ?? '';
  }
  return JSON.stringify(o);
}

export interface MessagingTemplatesFormHandle {
  /** If there are unsaved edits, prompts before calling `done`. Otherwise calls `done` immediately. */
  requestCloseWithDiscardConfirm: (done: () => void) => void;
}

export interface MessagingTemplatesFormProps {
  onClose?: () => void;
}

const TemplateField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholders: string[];
}> = ({ label, value, onChange, placeholders }) => (
  <div>
    <Textarea
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
    />
    <div className="text-xs text-slate-500 mt-1">
      <strong>Placeholders:</strong> {placeholders.join(', ')}
    </div>
  </div>
);

const MessagingTemplatesForm = forwardRef<MessagingTemplatesFormHandle, MessagingTemplatesFormProps>(
  ({ onClose }, ref) => {
    const state = useFullAppState();
    const dispatch = useDispatchOnly();
    const { showToast, showConfirm } = useNotification();
    const [templates, setTemplates] = useState<WhatsAppTemplates>(() => ({ ...state.whatsAppTemplates }));
    const templatesRef = useRef(templates);
    templatesRef.current = templates;

    const baselineSnapshotRef = useRef(snapshotTemplates({ ...state.whatsAppTemplates }));

    const closeWithDiscardConfirm = useCallback(
      (done: () => void) => {
        if (snapshotTemplates(templatesRef.current) === baselineSnapshotRef.current) {
          done();
          return;
        }
        void showConfirm(
          'You have unsaved changes to your messaging templates. If you continue, those changes will be discarded.',
          { title: 'Discard changes?', confirmLabel: 'Discard', cancelLabel: 'Keep editing' }
        ).then((ok) => {
          if (ok) done();
        });
      },
      [showConfirm]
    );

    useImperativeHandle(
      ref,
      () => ({
        requestCloseWithDiscardConfirm: closeWithDiscardConfirm,
      }),
      [closeWithDiscardConfirm]
    );

    const handleTemplateChange = (key: keyof WhatsAppTemplates, value: string) => {
      setTemplates((prev) => ({ ...prev, [key]: value }));
    };

    const handleSave = () => {
      const payload: WhatsAppTemplates = {
        ...state.whatsAppTemplates,
        ...templatesRef.current,
      };
      dispatch({ type: 'UPDATE_WHATSAPP_TEMPLATES', payload });
      showToast('Messaging templates updated successfully!', 'success');
      onClose?.();
    };

    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <TemplateField
            label="Invoice Reminder"
            value={templates.invoiceReminder}
            onChange={(val) => handleTemplateChange('invoiceReminder', val)}
            placeholders={['{contactName}', '{invoiceNumber}', '{subject}', '{amount}', '{dueDate}', '{unitName}']}
          />
          <TemplateField
            label="Invoice Payment Receipt"
            value={templates.invoiceReceipt}
            onChange={(val) => handleTemplateChange('invoiceReceipt', val)}
            placeholders={['{contactName}', '{invoiceNumber}', '{subject}', '{paidAmount}', '{balance}', '{totalUnpaid}', '{unitName}']}
          />
          <TemplateField
            label="Bill Payment Notification"
            value={templates.billPayment}
            onChange={(val) => handleTemplateChange('billPayment', val)}
            placeholders={['{contactName}', '{billNumber}', '{paidAmount}']}
          />
          <TemplateField
            label="Vendor Greeting"
            value={templates.vendorGreeting}
            onChange={(val) => handleTemplateChange('vendorGreeting', val)}
            placeholders={['{contactName}']}
          />
        </div>

        <div className="border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Payout Templates</h3>
          <div className="space-y-4">
            <TemplateField
              label="Owner Payout Ledger"
              value={templates.ownerPayoutLedger || ''}
              onChange={(val) => handleTemplateChange('ownerPayoutLedger', val)}
              placeholders={['{contactName}', '{payoutType}', '{collected}', '{expenses}', '{paid}', '{balance}']}
            />
            <TemplateField
              label="Broker Commission Ledger"
              value={templates.brokerPayoutLedger || ''}
              onChange={(val) => handleTemplateChange('brokerPayoutLedger', val)}
              placeholders={['{contactName}', '{earned}', '{paid}', '{balance}']}
            />
            <TemplateField
              label="Payout Confirmation"
              value={templates.payoutConfirmation || ''}
              onChange={(val) => handleTemplateChange('payoutConfirmation', val)}
              placeholders={['{contactName}', '{amount}', '{payoutType}', '{reference}']}
            />
          </div>
        </div>

        <div
          className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-app-modal pt-4 dark:border-app-border"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {onClose ? (
            <Button type="button" variant="secondary" onClick={() => closeWithDiscardConfirm(onClose)}>
              Cancel
            </Button>
          ) : null}
          <Button type="button" onClick={handleSave}>
            Save Templates
          </Button>
        </div>
      </div>
    );
  }
);

MessagingTemplatesForm.displayName = 'MessagingTemplatesForm';

export default MessagingTemplatesForm;
