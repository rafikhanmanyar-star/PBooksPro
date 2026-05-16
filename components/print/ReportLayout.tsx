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

  const isOwnerRentalIncome = data.elementId === 'owner-rental-income-print-root';

  return (
    <div
      className={`report-print-content${isOwnerRentalIncome ? ' owner-rental-income-report-print' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ width: '100%', minHeight: '100vh', background: '#fff' }}
    />
  );
};

export default ReportLayout;
