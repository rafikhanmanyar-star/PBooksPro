/**
 * Print Context - Central state for the React context-based print system.
 * Manages activeDocument, layoutType, and exposes print(type, data) to trigger
 * the print preview modal, then window.print() when user confirms.
 */

import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';

export type PrintLayoutType = 'PO' | 'INVOICE' | 'BILL' | 'AGREEMENT' | 'LEDGER' | 'REPORT' | 'PAYSLIP';

export type PrintPhase = 'idle' | 'preview' | 'printing';

export interface PrintContextValue {
  /** The data object currently set for printing (null when idle) */
  activeDocument: unknown;
  /** The layout to render: PO, INVOICE, BILL, AGREEMENT, LEDGER */
  layoutType: PrintLayoutType | null;
  /** Current phase: idle, preview (modal open), or printing (dialog open) */
  phase: PrintPhase;
  /** Call to set document + layout and show the print preview modal */
  print: (type: PrintLayoutType, data: unknown) => void;
  /** Close preview modal and reset (called when user clicks Close or after print) */
  closePreview: () => void;
  /** Confirm print from preview (opens system print dialog) */
  confirmPrint: () => void;
  /** Reset after print dialog closes (called by PrintController on afterprint) */
  reset: () => void;
}

const PrintContext = createContext<PrintContextValue | null>(null);

export function usePrintContext(): PrintContextValue {
  const ctx = useContext(PrintContext);
  if (!ctx) {
    throw new Error('usePrintContext must be used within a PrintProvider');
  }
  return ctx;
}

export function usePrintContextOptional(): PrintContextValue | null {
  return useContext(PrintContext);
}

interface PrintProviderProps {
  children: React.ReactNode;
}

export function PrintProvider({ children }: PrintProviderProps): React.ReactElement {
  const [activeDocument, setActiveDocument] = useState<unknown>(null);
  const [layoutType, setLayoutType] = useState<PrintLayoutType | null>(null);
  const [phase, setPhase] = useState<PrintPhase>('idle');

  const print = useCallback((type: PrintLayoutType, data: unknown) => {
    setLayoutType(type);
    setActiveDocument(data);
    setPhase('preview');
  }, []);

  const closePreview = useCallback(() => {
    setPhase('idle');
    setActiveDocument(null);
    setLayoutType(null);
  }, []);

  const confirmPrint = useCallback(() => {
    setPhase('printing');
  }, []);

  const reset = useCallback(() => {
    setActiveDocument(null);
    setLayoutType(null);
    setPhase('idle');
  }, []);

  const value = useMemo<PrintContextValue>(
    () => ({ activeDocument, layoutType, phase, print, closePreview, confirmPrint, reset }),
    [activeDocument, layoutType, phase, print, closePreview, confirmPrint, reset]
  );

  return (
    <PrintContext.Provider value={value}>
      {children}
    </PrintContext.Provider>
  );
}

export default PrintContext;
