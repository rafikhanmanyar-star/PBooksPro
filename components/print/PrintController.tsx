/**
 * Print Controller - Master component that listens to PrintContext and renders
 * the correct layout in a portal. Shows print preview modal first; when user
 * confirms, triggers window.print() and resets on afterprint.
 */

import { usePrintSettings } from '../../hooks/useSelectiveState';
import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePrintContext } from '../../context/PrintContext';
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
import { WhatsAppService } from '../../services/whatsappService';
import { elementToPdfBlob } from '../../utils/elementToPdf';
import { useNotification } from '../../context/NotificationContext';
import type { PayslipPrintData } from './PayslipPrintTemplate';
import { PurchaseOrder } from '../../types';
import './printForm.css';
import './printPortal.css';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const s = reader.result as string;
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

const PRINT_DELAY_MS = 350;

function usePrintContent(): React.ReactNode {
  const { activeDocument, layoutType } = usePrintContext();
  const printSettings = usePrintSettings();

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
  const { showToast } = useNotification();
  const [whatsAppPdfBusy, setWhatsAppPdfBusy] = useState(false);
  const content = usePrintContent();

  const reportData = layoutType === 'REPORT' ? (activeDocument as ReportPrintData) : null;
  const pdfWhatsApp = reportData?.pdfWhatsApp;

  const handleWhatsAppPdf = useCallback(async () => {
    if (!reportData?.elementId || !pdfWhatsApp) return;
    const el = document.getElementById(reportData.elementId);
    if (!el) {
      showToast('Could not find report content to export.', 'error');
      return;
    }
    setWhatsAppPdfBusy(true);
    try {
      const blob = await elementToPdfBlob(el as HTMLElement);
      const { contact, fileName } = pdfWhatsApp;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      try {
        if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (shareErr) {
        if ((shareErr as Error)?.name === 'AbortError') return;
        console.warn('[PrintController] navigator.share', shareErr);
      }

      const electron = (typeof window !== 'undefined'
        ? (window as unknown as {
            electronAPI?: {
              sharePdfOpenWhatsApp?: (p: {
                base64: string;
                fileName: string;
                phoneDigits: string;
              }) => Promise<{ clipboardOk: boolean }>;
            };
          }).electronAPI
        : undefined) as
        | {
            sharePdfOpenWhatsApp?: (p: {
              base64: string;
              fileName: string;
              phoneDigits: string;
            }) => Promise<{ clipboardOk: boolean }>;
          }
        | undefined;

      if (electron?.sharePdfOpenWhatsApp) {
        const base64 = await blobToBase64(blob);
        let phoneDigits = '';
        if (contact?.contactNo) {
          phoneDigits = WhatsAppService.formatPhoneNumber(contact.contactNo) ?? '';
        }
        await electron.sharePdfOpenWhatsApp({ base64, fileName, phoneDigits });
        return;
      }

      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(dlUrl);

      if (contact?.contactNo) {
        const formatted = WhatsAppService.formatPhoneNumber(contact.contactNo);
        if (formatted) {
          window.open(`https://wa.me/${formatted}`, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      window.open('https://wa.me/', '_blank', 'noopener,noreferrer');
    } catch (e) {
      console.error(e);
      showToast('Could not create PDF.', 'error');
    } finally {
      setWhatsAppPdfBusy(false);
    }
  }, [reportData, pdfWhatsApp, showToast]);

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
        showWhatsAppPdf={Boolean(pdfWhatsApp)}
        onWhatsAppPdf={pdfWhatsApp ? handleWhatsAppPdf : undefined}
        whatsAppPdfBusy={whatsAppPdfBusy}
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
