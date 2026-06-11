import { useDispatchOnly, useInvoices, useCategories, useRentalAgreements, useStateSelector } from '../hooks/useSelectiveState';
import { useMemo, useCallback, useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import {
  verifyInvoicesPersistedToServer,
  formatBulkInvoicePersistMessage,
} from '../utils/invoiceBulkPersistVerify';
import { isAccountingBackedByRemoteApi } from '../config/apiUrl';
import { RecurringInvoiceTemplate, Invoice, InvoiceType, InvoiceStatus } from '../types';
import {
  fixRecurringNextDueWhenDayOneIsLastDayOfMonth,
  getNextRecurringDueDate,
  parseYyyyMmDdToLocalDate,
  toLocalDateString } from '../utils/dateUtils';

export function useGenerateDueInvoices() {
  const recurringInvoiceTemplates = useStateSelector((s) => s.recurringInvoiceTemplates);
  const invoices = useInvoices();
  const categories = useCategories();
  const rentalAgreements = useRentalAgreements();
  const rentalInvoiceSettings = useStateSelector((s) => s.rentalInvoiceSettings);
  const dispatch = useDispatchOnly();
  const { showToast, showConfirm, showAlert } = useNotification();
  const [isGenerating, setIsGenerating] = useState(false);

  const templates = useMemo(() => recurringInvoiceTemplates || [], [recurringInvoiceTemplates]);
  const todayStr = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toLocalDateString(d);
  }, []);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const overdueTemplates = useMemo(
    () =>
      templates.filter(
        t =>
          t.active &&
          !t.deletedAt &&
          fixRecurringNextDueWhenDayOneIsLastDayOfMonth(t.nextDueDate, t.dayOfMonth || 1) <= todayStr
      ),
    [templates, todayStr]
  );

  const getNextInvoiceNumber = useCallback(() => {
    // rentalInvoiceSettings from hook
    const { prefix, nextNumber, padding } = rentalInvoiceSettings || { prefix: 'INV-', nextNumber: 1, padding: 5 };
    let maxNum = nextNumber;
    invoices.forEach(inv => {
      if (inv.invoiceNumber?.startsWith(prefix)) {
        const part = inv.invoiceNumber.substring(prefix.length);
        if (/^\d+$/.test(part)) {
          const num = parseInt(part, 10);
          if (num >= maxNum) maxNum = num + 1;
        }
      }
    });
    return { maxNum, prefix, padding };
  }, [recurringInvoiceTemplates, invoices, categories, rentalAgreements, rentalInvoiceSettings]);

  const generateSingleInvoice = useCallback(
    (template: RecurringInvoiceTemplate, invoiceNum: number, prefix: string, padding: number): Invoice => {
      const invoiceNumber = `${prefix}${String(invoiceNum).padStart(padding, '0')}`;
      const issueDate = fixRecurringNextDueWhenDayOneIsLastDayOfMonth(
        template.nextDueDate,
        template.dayOfMonth || 1
      );
      const dueDateObj = parseYyyyMmDdToLocalDate(issueDate);
      dueDateObj.setDate(dueDateObj.getDate() + 7);
      const monthYear = parseYyyyMmDdToLocalDate(issueDate).toLocaleString('default', { month: 'long', year: 'numeric' });
      const description = template.descriptionTemplate.replace('{Month}', monthYear);
      const rentalIncomeCategory = categories.find(c => c.name === 'Rental Income');
      return {
        id: `inv-rec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        invoiceNumber,
        contactId: template.contactId,
        invoiceType: template.invoiceType || InvoiceType.RENTAL,
        propertyId: template.propertyId,
        buildingId: template.buildingId,
        amount: template.amount,
        paidAmount: 0,
        status: InvoiceStatus.UNPAID,
        issueDate,
        dueDate: toLocalDateString(dueDateObj),
        description,
        categoryId: rentalIncomeCategory?.id,
        agreementId: template.agreementId,
        rentalMonth: issueDate.slice(0, 7),
        securityDepositCharge: 0 };
    },
    [categories]
  );

  const handleGenerateAllDue = useCallback(async () => {
    const dueTemplates = templates.filter(
      t =>
        t.active &&
        !t.deletedAt &&
        fixRecurringNextDueWhenDayOneIsLastDayOfMonth(t.nextDueDate, t.dayOfMonth || 1) <= todayStr
    );
    if (dueTemplates.length === 0) return;

    const confirmed = await showConfirm(
      `This will generate ${dueTemplates.length} invoice${dueTemplates.length > 1 ? 's' : ''} for all due schedules. Continue?`,
      { title: 'Generate Due Invoices', confirmLabel: 'Generate All' }
    );
    if (!confirmed) return;

    setIsGenerating(true);
    let totalCreated = 0;
    const createdIds: string[] = [];
    let { maxNum, prefix, padding } = getNextInvoiceNumber();

    const rentalAgreementsList = rentalAgreements || [];

    for (const template of dueTemplates) {
      let currentTemplate = { ...template };
      let issueDate = fixRecurringNextDueWhenDayOneIsLastDayOfMonth(
        currentTemplate.nextDueDate,
        currentTemplate.dayOfMonth || 1
      );
      let loopDate = parseYyyyMmDdToLocalDate(issueDate);
      loopDate.setHours(0, 0, 0, 0);
      const SAFE_LIMIT = 60;
      let count = 0;

      // Get agreement end date when template is linked to a rental agreement
      const agreement = currentTemplate.agreementId
        ? rentalAgreementsList.find((ra) => ra.id === currentTemplate.agreementId)
        : undefined;
      const agreementEndDate = agreement?.endDate
        ? (() => {
            const d = new Date(agreement.endDate);
            d.setHours(0, 0, 0, 0);
            return d;
          })()
        : undefined;

      while (loopDate <= today && count < SAFE_LIMIT) {
        if (currentTemplate.maxOccurrences && (currentTemplate.generatedCount || 0) >= currentTemplate.maxOccurrences) {
          currentTemplate.active = false;
          break;
        }
        // Do not generate invoices beyond the agreement end date
        if (agreementEndDate && loopDate > agreementEndDate) {
          currentTemplate.active = false;
          break;
        }
        const invoice = generateSingleInvoice(
          { ...currentTemplate, nextDueDate: issueDate },
          maxNum,
          prefix,
          padding
        );
        dispatch({ type: 'ADD_INVOICE', payload: invoice });
        createdIds.push(invoice.id);
        maxNum++;
        count++;
        totalCreated++;
        currentTemplate.generatedCount = (currentTemplate.generatedCount || 0) + 1;
        currentTemplate.lastGeneratedDate = new Date().toISOString();
        currentTemplate.nextDueDate = getNextRecurringDueDate(
          issueDate,
          currentTemplate.dayOfMonth || 1
        );
        issueDate = fixRecurringNextDueWhenDayOneIsLastDayOfMonth(
          currentTemplate.nextDueDate,
          currentTemplate.dayOfMonth || 1
        );
        loopDate = parseYyyyMmDdToLocalDate(issueDate);
        loopDate.setHours(0, 0, 0, 0);
      }
      dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: currentTemplate });
    }

    if (totalCreated > 0 && rentalInvoiceSettings) {
      dispatch({
        type: 'UPDATE_RENTAL_INVOICE_SETTINGS',
        payload: { ...rentalInvoiceSettings, nextNumber: maxNum } });
      if (isAccountingBackedByRemoteApi()) {
        const persistResult = await verifyInvoicesPersistedToServer(createdIds);
        const persistWarning = formatBulkInvoicePersistMessage(persistResult);
        if (persistWarning) {
          await showAlert(persistWarning, { title: 'Some invoices not saved' });
        } else {
          showToast(`Generated ${totalCreated} invoice${totalCreated > 1 ? 's' : ''} successfully.`, 'success');
        }
      } else {
        showToast(`Generated ${totalCreated} invoice${totalCreated > 1 ? 's' : ''} successfully.`, 'success');
      }
    }
    setIsGenerating(false);
  }, [templates, todayStr, today, getNextInvoiceNumber, generateSingleInvoice, dispatch, rentalInvoiceSettings, rentalAgreements, showConfirm, showToast, showAlert]);

  return { overdueCount: overdueTemplates.length, handleGenerateAllDue, isGenerating };
}
