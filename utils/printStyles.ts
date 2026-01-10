/**
 * Standardized print styles for consistent printing across the application
 */

export interface PrintStyleOptions {
  pageSize?: 'A4' | 'Letter';
  margin?: string;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Get standardized print CSS styles
 * @param options - Optional print style customization
 * @returns CSS string for print media queries
 */
export const getPrintStyles = (options: PrintStyleOptions = {}): string => {
  const {
    pageSize = 'A4',
    margin = '12.7mm',
    orientation = 'portrait'
  } = options;

  return `
    @media print {
      @page {
        size: ${pageSize} ${orientation};
        margin: ${margin};
      }
      html, body {
        height: auto !important;
        overflow: visible !important;
        background: white !important;
      }
      /* Hide non-printable elements - use display instead of visibility to avoid inheritance issues */
      .no-print {
        display: none !important;
        visibility: hidden !important;
      }
      /* Ensure printable area is always displayed in print mode, even if it has 'hidden' class */
      .printable-area.hidden,
      [id="printable-area"].hidden,
      .hidden.printable-area,
      [id="printable-area"][class*="hidden"] {
        display: block !important;
        visibility: visible !important;
      }
      /* Ensure printable area and all its content is visible */
      .printable-area,
      [id="printable-area"],
      .printable-area *,
      [id="printable-area"] * {
        visibility: visible !important;
      }
      /* Use relative positioning instead of fixed for better compatibility */
      .printable-area,
      [id="printable-area"] {
        position: relative !important;
        width: 100% !important;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 20px !important;
        background-color: white !important;
        box-sizing: border-box !important;
        max-height: none !important;
      }
      /* Ensure all nested containers within printable area allow overflow */
      .printable-area *,
      [id="printable-area"] * {
        overflow: visible !important;
        max-height: none !important;
        height: auto !important;
        visibility: visible !important;
      }
      /* Ensure table elements display correctly in print */
      .printable-area table,
      [id="printable-area"] table {
        display: table !important;
        width: 100% !important;
      }
      .printable-area thead,
      [id="printable-area"] thead {
        display: table-header-group !important;
      }
      .printable-area tbody,
      [id="printable-area"] tbody {
        display: table-row-group !important;
      }
      .printable-area tr,
      [id="printable-area"] tr {
        display: table-row !important;
      }
      .printable-area td,
      [id="printable-area"] td,
      .printable-area th,
      [id="printable-area"] th {
        display: table-cell !important;
      }
      .no-print {
        display: none !important;
        visibility: hidden !important;
      }
      ::-webkit-scrollbar {
        display: none;
      }
      table {
        page-break-inside: auto;
        width: 100% !important;
      }
      tr {
        page-break-inside: avoid;
        page-break-after: auto;
      }
      thead {
        display: table-header-group;
      }
      tfoot {
        display: table-footer-group;
      }
      /* Ensure colors print */
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      /* Prevent text truncation in print */
      .truncate,
      .max-w-xs {
        white-space: normal !important;
        overflow: visible !important;
        text-overflow: clip !important;
        max-width: none !important;
      }
      /* Ensure all text is visible */
      .printable-area td,
      .printable-area th {
        white-space: normal !important;
        word-wrap: break-word !important;
        overflow-wrap: break-word !important;
      }
      /* Remove shadows for cleaner print */
      .shadow-sm, .shadow-md, .shadow-lg {
        box-shadow: none !important;
      }
    }
  `;
};

/**
 * Standard print styles (default A4 portrait)
 */
export const STANDARD_PRINT_STYLES = getPrintStyles();

