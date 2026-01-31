/**
 * usePrintForm - Reusable hook for form printing via react-to-print.
 * Loads the correct print template, pulls form data + branding from Settings,
 * and opens the browser print dialog.
 *
 * Flow:
 * 1. User clicks Print on a form
 * 2. Component renders the form-specific Print Template (e.g. POPrintTemplate) in a hidden ref
 * 3. handlePrint() is called → react-to-print focuses the ref content and opens print dialog
 *
 * Separation of concerns:
 * - Screen UI: does not get printed
 * - Print layout: PrintLayout + form template (data-driven)
 * - Print styles: printForm.css @media print
 */

import { useRef, useCallback, ReactElement } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useAppContext } from '../context/AppContext';

export interface UsePrintFormOptions {
  /** Optional custom document title in print dialog */
  documentTitle?: string;
  /** Callback after print dialog is closed */
  onAfterPrint?: () => void;
  /** Callback when print is triggered */
  onBeforePrint?: () => void;
}

export interface UsePrintFormReturn {
  /** Ref to attach to the printable content (the template root) */
  printRef: React.RefObject<HTMLDivElement | null>;
  /** Call this to open the print dialog (e.g. from a Print button) */
  handlePrint: () => void;
  /** True while print is in progress */
  isPrinting: boolean;
}

/**
 * usePrintForm - Hook for printing form templates.
 * Pass a ref that will hold the printable content (e.g. <POPrintTemplate />).
 * Use handlePrint from a Print button.
 *
 * @example
 * const { printRef, handlePrint, isPrinting } = usePrintForm();
 * return (
 *   <>
 *     <button onClick={handlePrint} disabled={isPrinting}>Print</button>
 *     <div ref={printRef} style={{ position: 'absolute', left: -9999 }}>
 *       <POPrintTemplate printSettings={state.printSettings} data={selectedPO} />
 *     </div>
 *   </>
 * );
 */
export function usePrintForm(options: UsePrintFormOptions = {}): UsePrintFormReturn {
  const { state } = useAppContext();
  const printRef = useRef<HTMLDivElement | null>(null);
  const { documentTitle = 'Print', onAfterPrint, onBeforePrint } = options;

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle,
    onAfterPrint,
    onBeforePrint,
    pageStyle: `
      @page { size: A4; margin: 12.7mm; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        height: auto !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        background: #fff !important;
      }
      body * {
        visibility: visible;
      }
    `,
  });

  return {
    printRef,
    handlePrint,
    isPrinting: false, // react-to-print doesn't expose this; can be extended with local state if needed
  };
}

export default usePrintForm;
