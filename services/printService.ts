/**
 * Centralized print service for consistent printing across the application.
 *
 * Reports: usePrintReport() or usePrintContext().print('REPORT', { elementId }).
 * Forms (PO, Invoice, Bill, Agreement, Ledger, Payslip): usePrintContext().print(type, data).
 */

import { REPORT_PRINT_SURFACE_STYLES } from '../utils/printStyles';

/** Ensure report surface styles are present (idempotent). */
export const ensureReportPrintStyles = (): void => {
  const styleId = 'report-print-surface-styles';
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = REPORT_PRINT_SURFACE_STYLES;
  document.head.appendChild(style);
};
