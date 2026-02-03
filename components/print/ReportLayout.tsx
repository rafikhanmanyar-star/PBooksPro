/**
 * ReportLayout - Prints the current view by copying a DOM element's content
 * into the portal. Used for reports and marketing page (printable-area).
 * Same document styles apply, so cloned content keeps its look.
 */

import React, { useEffect, useState } from 'react';

export interface ReportPrintData {
  /** ID of the element to print (e.g. 'printable-area') */
  elementId: string;
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
  }, [data.elementId]);

  if (!html) return null;

  return (
    <div
      className="report-print-content"
      dangerouslySetInnerHTML={{ __html: html }}
      style={{ width: '100%', minHeight: '100vh', background: '#fff' }}
    />
  );
};

export default ReportLayout;
