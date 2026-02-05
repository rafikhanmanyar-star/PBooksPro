/**
 * Print Controller - Master component that listens to PrintContext and renders
 * the correct layout in a portal. Triggers window.print() after render and
 * resets state on afterprint.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePrintContext } from '../../context/PrintContext';
import { useAppContext } from '../../context/AppContext';
import { POPrintTemplate } from './POPrintTemplate';
import { InvoicePrintTemplate } from './InvoicePrintTemplate';
import { BillPrintTemplate } from './BillPrintTemplate';
import { AgreementLayout } from './AgreementLayout';
import { LedgerLayout } from './LedgerLayout';
import { ReportLayout } from './ReportLayout';
import { PayslipPrintTemplate } from './PayslipPrintTemplate';
import type { InvoicePrintData } from './InvoicePrintTemplate';
import type { BillPrintData } from './BillPrintTemplate';
import type { AgreementPrintData } from './AgreementLayout';
import type { LedgerPrintData } from './LedgerLayout';
import type { ReportPrintData } from './ReportLayout';
import type { PayslipPrintData } from './PayslipPrintTemplate';
import { PurchaseOrder } from '../../types';
import './printForm.css';
import './printPortal.css';

const PRINT_DELAY_MS = 350;

function PrintControllerContent(): React.ReactElement | null {
  const { activeDocument, layoutType, reset } = usePrintContext();
  const { state } = useAppContext();
  const printSettings = state.printSettings;
  const hasTriggeredPrint = useRef(false);

  // Mark body so print CSS only hides #root when we're using the portal (not usePrintForm)
  useEffect(() => {
    if (activeDocument == null || !layoutType) return;
    document.body.classList.add('print-portal-active');
    return () => document.body.classList.remove('print-portal-active');
  }, [activeDocument, layoutType]);

  // When activeDocument is set, trigger print after React has painted
  useEffect(() => {
    if (activeDocument == null || !layoutType) {
      hasTriggeredPrint.current = false;
      return;
    }
    hasTriggeredPrint.current = true;
    const t = setTimeout(() => {
      window.print();
    }, PRINT_DELAY_MS);
    return () => clearTimeout(t);
  }, [activeDocument, layoutType]);

  // Post-print cleanup: reset when user closes print dialog
  useEffect(() => {
    const handleAfterPrint = () => {
      reset();
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, [reset]);

  if (activeDocument == null || !layoutType) {
    return null;
  }

  let content: React.ReactNode;
  switch (layoutType) {
    case 'PO':
      content = (
        <POPrintTemplate
          printSettings={printSettings}
          data={activeDocument as PurchaseOrder}
        />
      );
      break;
    case 'INVOICE':
      content = (
        <InvoicePrintTemplate
          printSettings={printSettings}
          data={activeDocument as InvoicePrintData}
        />
      );
      break;
    case 'BILL':
      content = (
        <BillPrintTemplate
          printSettings={printSettings}
          data={activeDocument as BillPrintData}
        />
      );
      break;
    case 'AGREEMENT':
      content = (
        <AgreementLayout
          printSettings={printSettings}
          data={activeDocument as AgreementPrintData}
        />
      );
      break;
    case 'LEDGER':
      content = (
        <LedgerLayout
          printSettings={printSettings}
          data={activeDocument as LedgerPrintData}
        />
      );
      break;
    case 'REPORT':
      content = <ReportLayout data={activeDocument as ReportPrintData} />;
      break;
    case 'PAYSLIP':
      content = (
        <PayslipPrintTemplate
          printSettings={printSettings}
          data={activeDocument as PayslipPrintData}
        />
      );
      break;
    default:
      content = null;
  }

  return (
    <div id="print-portal" className="print-portal-root" aria-hidden="true">
      {content}
    </div>
  );
}

/**
 * Renders the print overlay into document.body via a portal so that parent
 * overflow/visibility doesn't clip the printed content.
 */
export function PrintController(): React.ReactElement | null {
  const { activeDocument, layoutType } = usePrintContext();
  const hasContent = activeDocument != null && layoutType != null;

  if (!hasContent) {
    return null;
  }

  return createPortal(
    <PrintControllerContent />,
    document.body
  );
}

export default PrintController;
