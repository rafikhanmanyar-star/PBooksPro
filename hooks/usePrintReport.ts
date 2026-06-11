/**
 * Standard hook for printing report views via PrintContext.
 * Opens the print preview modal, then prints the cloned printable DOM.
 */

import { useCallback } from 'react';
import { usePrintContext } from '../context/PrintContext';
import type { ReportPrintPdfWhatsApp } from '../components/print/ReportLayout';

export interface PrintReportOptions {
  /** DOM id of the printable root (default: printable-area) */
  elementId?: string;
  /** Optional PDF + WhatsApp share from preview */
  pdfWhatsApp?: ReportPrintPdfWhatsApp;
}

/**
 * @example
 * const printReport = usePrintReport();
 * printReport(); // prints #printable-area
 * printReport({ elementId: 'print-area' });
 */
export function usePrintReport() {
  const { print } = usePrintContext();

  return useCallback(
    (options: PrintReportOptions = {}) => {
      const { elementId = 'printable-area', pdfWhatsApp } = options;
      print('REPORT', { elementId, pdfWhatsApp });
    },
    [print]
  );
}

export default usePrintReport;
