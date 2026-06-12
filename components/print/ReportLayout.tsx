/**
 * ReportLayout - Prints the current view by copying a DOM element's content
 * into the portal. Used for reports and marketing page (printable-area).
 * Same document styles apply, so cloned content keeps its look.
 */

import React, { useEffect, useState } from 'react';
import type { Contact, Vendor } from '../../types';

/** PDF share from print preview: opens WhatsApp with optional recipient; no message text. */
export interface ReportPrintPdfWhatsApp {
  fileName: string;
  contact: Contact | Vendor | null;
}

export interface ReportPrintData {
  /** ID of the element to print (e.g. 'printable-area') */
  elementId: string;
  pdfWhatsApp?: ReportPrintPdfWhatsApp;
}

export interface ReportLayoutProps {
  /** Data with elementId to copy */
  data: ReportPrintData;
}

export const ReportLayout: React.FC<ReportLayoutProps> = ({ data }) => {
  const [html, setHtml] = useState<string>('');

  useEffect(() => {
    const el = document.getElementById(data.elementId);
    if (el) {
      setHtml(el.innerHTML);
    }
  }, [data]);

  if (!html) return null;

  const reportPrintClass =
    data.elementId === 'owner-rental-income-print-root'
      ? ' owner-rental-income-report-print'
      : data.elementId === 'print-area'
        ? ' owner-ledger-report-print'
        : data.elementId === 'custom-report-print-area'
          ? ' custom-report-print'
          : data.elementId === 'fund-availability-print'
            ? ' fund-availability-report-print'
            : data.elementId === 'dashboard-print-area'
              ? ' dashboard-report-print'
              : data.elementId === 'equity-ledger-print-area'
                ? ' equity-ledger-report-print'
                : data.elementId === 'transaction-log-print-area'
                  ? ' transaction-log-report-print'
                  : data.elementId === 'project-contract-print-area'
                    ? ' project-contract-report-print'
                    : data.elementId === 'project-profitability-print'
                      ? ' project-profitability-report-print'
                      : data.elementId === 'undistributed-funds-print'
                        ? ' undistributed-funds-report-print'
                        : data.elementId === 'inv-mgmt-profit-print'
                          ? ' inv-mgmt-profit-report-print'
                          : '';

  return (
    <div
      className={`report-print-content print-report-surface${reportPrintClass}`}
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ width: '100%', minHeight: '100vh', background: '#fff', color: '#0f172a' }}
    />
  );
};

export default ReportLayout;
