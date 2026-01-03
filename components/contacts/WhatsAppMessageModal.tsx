import React, { useState, useEffect } from 'react';
import { useAppContext } from '../../context/AppContext';
import { Contact } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import { WhatsAppService } from '../../services/whatsappService';
import { useNotification } from '../../context/NotificationContext';
import { ICONS } from '../../constants';

interface WhatsAppMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact | null;
  templateType?: 'invoiceReminder' | 'invoiceReceipt' | 'billPayment' | 'vendorGreeting' | 'custom';
  templateVariables?: Record<string, string | number>;
  initialMessage?: string;
}

const WhatsAppMessageModal: React.FC<WhatsAppMessageModalProps> = ({
  isOpen,
  onClose,
  contact,
  templateType,
  templateVariables,
  initialMessage
}) => {
  const { state } = useAppContext();
  const { showAlert } = useNotification();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !contact) {
      setMessage('');
      return;
    }

    let generatedMessage = '';

    if (initialMessage) {
      generatedMessage = initialMessage;
    } else if (templateType && templateType !== 'custom') {
      const template = state.whatsAppTemplates[templateType];

      switch (templateType) {
        case 'invoiceReminder':
          if (templateVariables) {
            generatedMessage = WhatsAppService.generateInvoiceReminder(
              template,
              contact,
              String(templateVariables.invoiceNumber || ''),
              Number(templateVariables.amount || 0),
              String(templateVariables.dueDate || ''),
              String(templateVariables.subject || ''),
              String(templateVariables.unitName || '')
            );
          }
          break;
        case 'invoiceReceipt':
          if (templateVariables) {
            generatedMessage = WhatsAppService.generateInvoiceReceipt(
              template,
              contact,
              String(templateVariables.invoiceNumber || ''),
              Number(templateVariables.paidAmount || 0),
              Number(templateVariables.balance || 0),
              String(templateVariables.subject || ''),
              String(templateVariables.unitName || '')
            );
          }
          break;
        case 'billPayment':
          if (templateVariables) {
            generatedMessage = WhatsAppService.generateBillPayment(
              template,
              contact,
              String(templateVariables.billNumber || ''),
              Number(templateVariables.paidAmount || 0)
            );
          }
          break;
        case 'vendorGreeting':
          generatedMessage = WhatsAppService.generateVendorGreeting(template, contact);
          break;
      }
    } else {
      // Default greeting
      generatedMessage = `Hello ${contact.name}, this is a message from PBooks Pro.`;
    }

    setMessage(generatedMessage);
  }, [isOpen, contact, templateType, templateVariables, initialMessage, state.whatsAppTemplates]);

  const handleSend = async () => {
    if (!contact) return;

    if (!contact.contactNo) {
      await showAlert(`Contact "${contact.name}" does not have a phone number saved.`);
      return;
    }

    if (!WhatsAppService.isValidPhoneNumber(contact.contactNo)) {
      await showAlert(`Invalid phone number format for "${contact.name}". Please update the contact.`);
      return;
    }

    if (!message.trim()) {
      await showAlert('Please enter a message to send.');
      return;
    }

    setIsLoading(true);
    try {
      WhatsAppService.sendMessage({
        contact,
        message: message.trim()
      });
      // Small delay to ensure WhatsApp opens before closing modal
      setTimeout(() => {
        onClose();
      }, 300);
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
    } finally {
      setIsLoading(false);
    }
  };

  if (!contact) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Send WhatsApp to ${contact.name}`}>
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
          <div className="text-green-600 mt-0.5">{ICONS.whatsapp}</div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">WhatsApp Integration</p>
            <p className="text-xs text-green-700 mt-1">
              This will open WhatsApp Web/Desktop with a pre-filled message. Make sure WhatsApp is installed or accessible in your browser.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Phone Number
          </label>
          <p className="text-sm text-gray-600 font-mono bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
            {contact.contactNo || 'No phone number'}
          </p>
          {contact.contactNo && !WhatsAppService.isValidPhoneNumber(contact.contactNo) && (
            <p className="text-xs text-red-600 mt-1">
              ⚠️ Invalid phone number format. Please update the contact.
            </p>
          )}
        </div>

        <Textarea
          label="Message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={8}
          placeholder="Type your message here..."
        />

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={isLoading || !message.trim() || !contact.contactNo}
          >
            {isLoading ? 'Opening...' : 'Open WhatsApp'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default WhatsAppMessageModal;

