/**
 * Print Controller - Master component that listens to PrintContext and renders
 * the correct layout in a portal. Shows print preview modal first; when user
 * confirms, triggers window.print() and resets on afterprint.
 */

import React, { useEffect } from 'react';
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
import { PrintPreviewModal } from './PrintPreviewModal';
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

function usePrintContent(): React.ReactNode {
  const { activeDocument, layoutType } = usePrintContext();
  const { state } = useAppContext();
  const printSettings = state.printSettings;

  if (activeDocument == null || !layoutType) return null;

  switch (layoutType) {
    case 'PO':
      return (
        <POPrintTemplate
          printSettings={printSettings}
          data={activeDocument as PurchaseOrder}
        />
      );
    case 'INVOICE':
      return (
        <InvoicePrintTemplate
          printSettings={printSettings}
          data={activeDocument as InvoicePrintData}
        />
      );
    case 'BILL':
      return (
        <BillPrintTemplate
          printSettings={printSettings}
          data={activeDocument as BillPrintData}
        />
      );
    case 'AGREEMENT':
      return (
        <AgreementLayout
          printSettings={printSettings}
          data={activeDocument as AgreementPrintData}
        />
      );
    case 'LEDGER':
      return (
        <LedgerLayout
          printSettings={printSettings}
          data={activeDocument as LedgerPrintData}
        />
      );
    case 'REPORT':
      return <ReportLayout data={activeDocument as ReportPrintData} />;
    case 'PAYSLIP':
      return (
        <PayslipPrintTemplate
          printSettings={printSettings}
          data={activeDocument as PayslipPrintData}
        />
      );
    default:
      return null;
  }
}

function PrintControllerContent(): React.ReactElement | null {
  const { activeDocument, layoutType, phase, closePreview, confirmPrint, reset } = usePrintContext();
  const content = usePrintContent();

  // Mark body so print CSS only hides #root when we're using the portal (not usePrintForm)
  useEffect(() => {
    if (activeDocument == null || !layoutType) return;
    document.body.classList.add('print-portal-active');
    return () => document.body.classList.remove('print-portal-active');
  }, [activeDocument, layoutType]);

  // When phase becomes 'printing', trigger window.print() after paint
  useEffect(() => {
    if (phase !== 'printing' || activeDocument == null || !layoutType) return;
    const t = setTimeout(() => {
      window.print();
    }, PRINT_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, activeDocument, layoutType]);

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

  return (
    <>
      {/* Portal content: used for actual printing (hidden on screen when preview is open) */}
      <div id="print-portal" className="print-portal-root" aria-hidden="true">
        {content}
      </div>
      {/* Preview modal: shown when phase is 'preview' */}
      <PrintPreviewModal
        open={phase === 'preview'}
        onClose={closePreview}
        onPrint={confirmPrint}
      >
        {content}
      </PrintPreviewModal>
    </>
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
