/**
 * Print Context - Central state for the React context-based print system.
 * Manages activeDocument, layoutType, and exposes print(type, data) to trigger
 * the print overlay and subsequent window.print().
 */

import React, { createContext, useContext, useCallback, useState, useMemo } from 'react';

export type PrintLayoutType = 'PO' | 'INVOICE' | 'BILL' | 'AGREEMENT' | 'LEDGER' | 'REPORT';

export interface PrintContextValue {
  /** The data object currently set for printing (null when idle) */
  activeDocument: unknown;
  /** The layout to render: PO, INVOICE, BILL, AGREEMENT, LEDGER */
  layoutType: PrintLayoutType | null;
  /** Call to set document + layout and show the print overlay (triggers print after render) */
  print: (type: PrintLayoutType, data: unknown) => void;
  /** Reset after print dialog closes (called by PrintController) */
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

  const print = useCallback((type: PrintLayoutType, data: unknown) => {
    setLayoutType(type);
    setActiveDocument(data);
  }, []);

  const reset = useCallback(() => {
    setActiveDocument(null);
    setLayoutType(null);
  }, []);

  const value = useMemo<PrintContextValue>(
    () => ({ activeDocument, layoutType, print, reset }),
    [activeDocument, layoutType, print, reset]
  );

  return (
    <PrintContext.Provider value={value}>
      {children}
    </PrintContext.Provider>
  );
}

export default PrintContext;
