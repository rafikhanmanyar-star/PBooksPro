/**
 * React hook for consistent print functionality
 */

import { useState, useCallback } from 'react';
import { useAppContext } from '../context/AppContext';
import { printPrintableArea, printFromTemplate, PrintOptions } from '../services/printService';
import { PrintSettings } from '../types';

export interface UsePrintOptions {
  printSettings?: PrintSettings;
  includeTemplate?: boolean;
  elementId?: string;
  printType?: 'data' | 'template';
}

export interface UsePrintReturn {
  handlePrint: () => void;
  isPrinting: boolean;
  printError: Error | null;
}

/**
 * Custom hook for print functionality
 * Automatically integrates print template settings from app context
 * 
 * @param options - Print options
 * @returns Print handler, loading state, and error state
 */
export const usePrint = (options: UsePrintOptions = {}): UsePrintReturn => {
  const { state } = useAppContext();
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<Error | null>(null);

  const {
    printSettings: providedPrintSettings,
    includeTemplate = true,
    elementId = 'printable-area',
    printType = 'data'
  } = options;

  // Use provided print settings or fall back to app context
  const printSettings = providedPrintSettings || state.printSettings;

  const handlePrint = useCallback(() => {
    setIsPrinting(true);
    setPrintError(null);

    try {
      if (printType === 'template') {
        // For template-based printing, the component should provide the HTML
        // This is mainly for InvoiceDetailView which handles its own template
        console.warn('usePrint: Template printing should be handled by the component directly');
        window.print();
      } else {
        // Standard data printing
        printPrintableArea({
          elementId,
          printSettings,
          includeTemplate
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Print failed');
      setPrintError(err);
      console.error('Print error:', err);
    } finally {
      // Reset printing state after a short delay
      setTimeout(() => {
        setIsPrinting(false);
      }, 500);
    }
  }, [elementId, includeTemplate, printSettings, printType]);

  return {
    handlePrint,
    isPrinting,
    printError
  };
};

