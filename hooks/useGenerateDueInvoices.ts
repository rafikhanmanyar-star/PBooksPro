import { useMemo, useCallback, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { useNotification } from '../context/NotificationContext';
import { RecurringInvoiceTemplate, Invoice, InvoiceType, InvoiceStatus } from '../types';

export function useGenerateDueInvoices() {
  const { state, dispatch } = useAppContext();
  const { showToast, showConfirm } = useNotification();
  const [isGenerating, setIsGenerating] = useState(false);

  const templates = useMemo(() => state.recurringInvoiceTemplates || [], [state.recurringInvoiceTemplates]);
  const todayStr = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  }, []);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const overdueTemplates = useMemo(
    () => templates.filter(t => t.active && t.nextDueDate <= todayStr),
    [templates, todayStr]
  );

  const calculateNextMonthDate = (currentDate: Date, dayOfMonth: number): Date => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    const targetMonth = nextDate.getMonth();
    const targetYear = nextDate.getFullYear();
    const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const targetDay = Math.min(dayOfMonth, daysInTargetMonth);
    nextDate.setDate(targetDay);
    return nextDate;
  };

  const getNextInvoiceNumber = useCallback(() => {
    const { rentalInvoiceSettings } = state;
    const { prefix, nextNumber, padding } = rentalInvoiceSettings || { prefix: 'INV-', nextNumber: 1, padding: 5 };
    let maxNum = nextNumber;
    state.invoices.forEach(inv => {
      if (inv.invoiceNumber?.startsWith(prefix)) {
        const part = inv.invoiceNumber.substring(prefix.length);
        if (/^\d+$/.test(part)) {
          const num = parseInt(part, 10);
          if (num >= maxNum) maxNum = num + 1;
        }
      }
    });
    return { maxNum, prefix, padding };
  }, [state]);

  const generateSingleInvoice = useCallback(
    (template: RecurringInvoiceTemplate, invoiceNum: number, prefix: string, padding: number): Invoice => {
      const invoiceNumber = `${prefix}${String(invoiceNum).padStart(padding, '0')}`;
      const issueDate = template.nextDueDate;
      const dueDateObj = new Date(issueDate);
      dueDateObj.setDate(dueDateObj.getDate() + 7);
      const monthYear = new Date(issueDate).toLocaleString('default', { month: 'long', year: 'numeric' });
      const description = template.descriptionTemplate.replace('{Month}', monthYear);
      const rentalIncomeCategory = state.categories.find(c => c.name === 'Rental Income');
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
        dueDate: dueDateObj.toISOString(),
        description,
        categoryId: rentalIncomeCategory?.id,
        agreementId: template.agreementId,
        rentalMonth: issueDate.slice(0, 7),
        securityDepositCharge: 0,
      };
    },
    [state.categories]
  );

  const handleGenerateAllDue = useCallback(async () => {
    const dueTemplates = templates.filter(t => t.active && t.nextDueDate <= todayStr);
    if (dueTemplates.length === 0) return;

    const confirmed = await showConfirm(
      `This will generate ${dueTemplates.length} invoice${dueTemplates.length > 1 ? 's' : ''} for all due schedules. Continue?`,
      { title: 'Generate Due Invoices', confirmLabel: 'Generate All' }
    );
    if (!confirmed) return;

    setIsGenerating(true);
    let totalCreated = 0;
    let { maxNum, prefix, padding } = getNextInvoiceNumber();

    for (const template of dueTemplates) {
      let currentTemplate = { ...template };
      let loopDate = new Date(currentTemplate.nextDueDate);
      loopDate.setHours(0, 0, 0, 0);
      const SAFE_LIMIT = 60;
      let count = 0;

      while (loopDate <= today && count < SAFE_LIMIT) {
        if (currentTemplate.maxOccurrences && (currentTemplate.generatedCount || 0) >= currentTemplate.maxOccurrences) {
          currentTemplate.active = false;
          break;
        }
        const invoice = generateSingleInvoice(currentTemplate, maxNum, prefix, padding);
        dispatch({ type: 'ADD_INVOICE', payload: invoice });
        maxNum++;
        count++;
        totalCreated++;
        currentTemplate.generatedCount = (currentTemplate.generatedCount || 0) + 1;
        currentTemplate.lastGeneratedDate = new Date().toISOString();
        loopDate = calculateNextMonthDate(loopDate, currentTemplate.dayOfMonth || 1);
        currentTemplate.nextDueDate = loopDate.toISOString().split('T')[0];
      }
      dispatch({ type: 'UPDATE_RECURRING_TEMPLATE', payload: currentTemplate });
    }

    if (totalCreated > 0 && state.rentalInvoiceSettings) {
      dispatch({
        type: 'UPDATE_RENTAL_INVOICE_SETTINGS',
        payload: { ...state.rentalInvoiceSettings, nextNumber: maxNum },
      });
      showToast(`Generated ${totalCreated} invoice${totalCreated > 1 ? 's' : ''} successfully.`, 'success');
    }
    setIsGenerating(false);
  }, [templates, todayStr, today, getNextInvoiceNumber, generateSingleInvoice, dispatch, state.rentalInvoiceSettings, showConfirm, showToast]);

  return { overdueCount: overdueTemplates.length, handleGenerateAllDue, isGenerating };
}
