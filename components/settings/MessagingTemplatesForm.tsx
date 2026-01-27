
import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { WhatsAppTemplates } from '../../types';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';
import { useNotification } from '../../context/NotificationContext';

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

const MessagingTemplatesForm: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const { showToast } = useNotification();
  const [templates, setTemplates] = useState<WhatsAppTemplates>(state.whatsAppTemplates);

  const handleTemplateChange = (key: keyof WhatsAppTemplates, value: string) => {
    setTemplates(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    dispatch({ type: 'UPDATE_WHATSAPP_TEMPLATES', payload: templates });
    showToast('Messaging templates updated successfully!', 'success');
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
          placeholders={['{contactName}', '{invoiceNumber}', '{subject}', '{paidAmount}', '{balance}', '{unitName}']}
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
      <div className="flex justify-end">
        <Button onClick={handleSave}>Save Templates</Button>
      </div>
    </div>
  );
};

export default MessagingTemplatesForm;
