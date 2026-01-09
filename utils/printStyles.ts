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
      body * {
        visibility: hidden;
      }
      .printable-area, .printable-area * {
        visibility: visible !important;
      }
      .printable-area {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: auto !important;
        overflow: visible !important;
        margin: 0 !important;
        padding: 0 !important;
        background-color: white;
        z-index: 9999;
        box-sizing: border-box;
      }
      .no-print {
        display: none !important;
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

