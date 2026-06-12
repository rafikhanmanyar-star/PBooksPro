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

/**
 * Print preview / portal clone use light tokens on screen; live pages keep app theme.
 * @media print forces light ink for all printable surfaces.
 */
export const REPORT_PRINT_SURFACE_STYLES = `
  .report-print-content,
  .print-preview-content {
    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-muted: #64748b;
    --text-placeholder: #94a3b8;
    --bg-primary: #ffffff;
    --card-bg: #ffffff;
    --layer-bg: #ffffff;
    --layer-surface: #ffffff;
    --toolbar-bg: #f8fafc;
    --table-header-bg: #f8fafc;
    --table-row-bg: #ffffff;
    --border-color: #e2e8f0;
    --input-bg: #ffffff;
    background-color: #ffffff !important;
    color: #0f172a !important;
  }

  .report-print-content .text-app-text,
  .print-preview-content .text-app-text {
    color: #0f172a !important;
  }

  .report-print-content .text-app-muted,
  .print-preview-content .text-app-muted {
    color: #64748b !important;
  }

  .report-print-content .bg-app-card,
  .report-print-content .bg-app-toolbar,
  .report-print-content .bg-app-table-header,
  .print-preview-content .bg-app-card,
  .print-preview-content .bg-app-toolbar {
    background-color: #ffffff !important;
  }

  .report-branding-header,
  .report-branding-footer {
    display: none !important;
  }

  .print-preview-content .report-branding-header,
  .print-preview-content .report-branding-footer,
  .report-print-content .report-branding-header,
  .report-print-content .report-branding-footer {
    display: block !important;
  }

  .report-title-block {
    page-break-after: avoid;
  }

  @media print {
    .report-branding-header,
    .report-branding-footer {
      display: block !important;
    }

    .report-print-content,
    .print-preview-content,
    .print-report-surface,
    .printable-area {
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --text-placeholder: #94a3b8;
      --bg-primary: #ffffff;
      --card-bg: #ffffff;
      --layer-bg: #ffffff;
      --layer-surface: #ffffff;
      --toolbar-bg: #f8fafc;
      --table-header-bg: #f8fafc;
      --table-row-bg: #ffffff;
      --border-color: #e2e8f0;
      --input-bg: #ffffff;
      background: #ffffff !important;
      color: #0f172a !important;
    }

    .print-report-surface .text-app-text,
    .printable-area .text-app-text,
    .report-print-content .text-app-text {
      color: #0f172a !important;
    }

    .print-report-surface .text-app-muted,
    .printable-area .text-app-muted,
    .report-print-content .text-app-muted {
      color: #64748b !important;
    }

    .print-report-surface .bg-app-card,
    .print-report-surface .bg-app-toolbar,
    .printable-area .bg-app-card,
    .printable-area .bg-app-toolbar,
    .report-print-content .bg-app-card,
    .report-print-content .bg-app-toolbar {
      background-color: #ffffff !important;
    }
  }
`;

