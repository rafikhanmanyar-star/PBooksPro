/**
 * Centralized print service for consistent printing across the application.
 *
 * Reports: usePrintReport() or usePrintContext().print('REPORT', { elementId }).
 * Forms (PO, Invoice, Bill, Agreement, Ledger, Payslip): usePrintContext().print(type, data).
 */

import { REPORT_PRINT_SURFACE_STYLES } from '../utils/printStyles';

/** Ensure report surface styles are present and up to date (idempotent upsert). */
export const ensureReportPrintStyles = (): void => {
  const styleId = 'report-print-surface-styles';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }
  style.textContent = REPORT_PRINT_SURFACE_STYLES;
};
