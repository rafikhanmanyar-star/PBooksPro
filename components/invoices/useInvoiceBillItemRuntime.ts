import { useCallback, useMemo } from 'react';
import type { Bill, Invoice } from '../../types';
import { CURRENCY } from '../../constants';
import {
  useBuildings,
  useContacts,
  useDispatchOnly,
  useInvoices,
  useProjectAgreements,
  useProjects,
  useProperties,
  useRentalAgreements,
  useStateSelector,
  useUnits,
  useWhatsAppMode,
  useWhatsAppTemplates,
  selectEnableColorCoding,
} from '../../hooks/useSelectiveState';
import { useLookupMaps } from '../../hooks/useLookupMaps';
import { useNotification } from '../../context/NotificationContext';
import { useWhatsApp } from '../../context/WhatsAppContext';
import { formatDate } from '../../utils/dateUtils';
import { WhatsAppService, sendOrOpenWhatsApp } from '../../services/whatsappService';
import { formatCurrency } from '../../utils/numberUtils';
import { sumOutstandingInvoiceBalancesForContact } from '../../utils/sumOutstandingInvoiceBalancesForContact';
import { InvoiceType } from '../../types';
import {
  buildInvoiceBillItemViewModel,
  buildInvoiceBillItemViewModels,
  type InvoiceBillItemBuildContext,
  type InvoiceBillItemViewModel,
} from './invoiceBillItemViewModel';

export function useInvoiceBillItemRuntime() {
  const contacts = useContacts();
  const projectAgreements = useProjectAgreements();
  const rentalAgreements = useRentalAgreements();
  const units = useUnits();
  const properties = useProperties();
  const buildings = useBuildings();
  const projects = useProjects();
  const whatsAppMode = useWhatsAppMode();
  const enableColorCoding = useStateSelector(selectEnableColorCoding);
  const whatsAppTemplates = useWhatsAppTemplates();
  const invoices = useInvoices();
  const dispatch = useDispatchOnly();
  const lookups = useLookupMaps();
  const { showConfirm, showToast, showAlert } = useNotification();
  const { openChat } = useWhatsApp();

  const buildContext = useMemo(
    (): InvoiceBillItemBuildContext => ({
      contacts,
      projectAgreements,
      rentalAgreements,
      units,
      properties,
      buildings,
      projects,
      enableColorCoding,
      contactNameById: lookups.contacts,
    }),
    [
      contacts,
      projectAgreements,
      rentalAgreements,
      units,
      properties,
      buildings,
      projects,
      enableColorCoding,
      lookups.contacts,
    ]
  );

  const buildViewModel = useCallback(
    (item: Invoice | Bill, type: 'invoice' | 'bill') =>
      buildInvoiceBillItemViewModel(item, type, buildContext),
    [buildContext]
  );

  const buildViewModels = useCallback(
    (items: (Invoice | Bill)[], type: 'invoice' | 'bill'): InvoiceBillItemViewModel[] =>
      buildInvoiceBillItemViewModels(items, type, buildContext),
    [buildContext]
  );

  const handleDelete = useCallback(
    async (item: Invoice | Bill, type: 'invoice' | 'bill') => {
      if (item.paidAmount > 0) {
        await showAlert(
          `Cannot delete this ${type} because it has associated payments (${CURRENCY} ${formatCurrency(item.paidAmount)}).\n\nPlease delete the payment transactions from the ledger first.`,
          { title: 'Deletion Blocked' }
        );
        return;
      }
      const confirmed = await showConfirm(`Are you sure you want to delete this ${type}?`, {
        title: `Delete ${type === 'invoice' ? 'Invoice' : 'Bill'}`,
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
      });
      if (!confirmed) return;

      if (type === 'invoice') dispatch({ type: 'DELETE_INVOICE', payload: item.id });
      else dispatch({ type: 'DELETE_BILL', payload: item.id });
      showToast(`${type === 'invoice' ? 'Invoice' : 'Bill'} deleted successfully`, 'info');
    },
    [dispatch, showAlert, showConfirm, showToast]
  );

  const handleSendWhatsApp = useCallback(
    (item: Invoice | Bill, type: 'invoice' | 'bill') => {
      const contact = item.contactId ? contacts.find((c) => c.id === item.contactId) : undefined;
      if (!contact?.contactNo) {
        showAlert('This contact does not have a phone number saved.');
        return;
      }

      try {
        const viewModel = buildInvoiceBillItemViewModel(item, type, buildContext);
        const { number, balance, amount, paidAmount, dueDate } = viewModel;
        const hasMadePayment = paidAmount > 0;
        let message = '';

        if (type === 'invoice') {
          let subject = viewModel.propertyName || viewModel.projectName || 'your invoice';
          if (viewModel.projectName && viewModel.unitName) {
            subject = `${viewModel.projectName} - Unit ${viewModel.unitName}`;
          }
          const unitName = viewModel.unitName || '';

          if (hasMadePayment) {
            const inv = item as Invoice;
            const totalUnpaid = item.contactId
              ? sumOutstandingInvoiceBalancesForContact(invoices, item.contactId, {
                  invoiceId: inv.id,
                  invoiceBalanceOverride: balance,
                })
              : balance;
            message = WhatsAppService.generateInvoiceReceipt(
              whatsAppTemplates.invoiceReceipt,
              contact,
              number,
              paidAmount,
              balance,
              subject,
              unitName,
              totalUnpaid
            );
          } else {
            message = WhatsAppService.generateInvoiceReminder(
              whatsAppTemplates.invoiceReminder,
              contact,
              number,
              amount,
              dueDate ? formatDate(dueDate) : undefined,
              subject,
              unitName
            );
          }
        } else {
          message = WhatsAppService.generateBillPayment(
            whatsAppTemplates.billPayment,
            contact,
            number,
            paidAmount
          );
        }

        sendOrOpenWhatsApp({ contact, message, phoneNumber: contact.contactNo }, () => whatsAppMode, openChat);
      } catch (error) {
        showAlert(error instanceof Error ? error.message : 'Failed to open WhatsApp');
      }
    },
    [
      buildContext,
      contacts,
      invoices,
      openChat,
      showAlert,
      whatsAppMode,
      whatsAppTemplates.billPayment,
      whatsAppTemplates.invoiceReceipt,
      whatsAppTemplates.invoiceReminder,
    ]
  );

  return {
    buildViewModel,
    buildViewModels,
    handleDelete,
    handleSendWhatsApp,
  };
}

/** Count Zustand slice subscriptions used by the list/container runtime (for perf reporting). */
export const INVOICE_BILL_ITEM_RUNTIME_SUBSCRIPTION_COUNT = 11;
